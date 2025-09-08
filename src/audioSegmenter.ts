import { SegmentOptions, SegmentResult } from './types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, readFileSync, statSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export type { SegmentOptions, SegmentResult } from './types';

const execAsync = promisify(exec);

interface SilenceInterval {
  start: number;
  end: number;
}

interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  codec: string;
  bitRate?: number;
}

export class AudioSegmenter {
  private tempDir: string;
  private ffmpegPath: string | null = null;
  private userFfmpegPath?: string;

  constructor(userFfmpegPath?: string) {
    this.tempDir = join(tmpdir(), 'attn-audio-segmenter');
    this.userFfmpegPath = userFfmpegPath;
    this.ensureTempDir();
  }

  async segmentAudio(input: File | Buffer | string, options: SegmentOptions): Promise<SegmentResult[]> {
    const maxSizeMB = options.maxUploadSizeMB || 24.5;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const maxDurationSec = options.maxChunkDurationSec || 85;
    const silenceThresholdDb = options.silenceThresholdDb || -35;
    const minSilenceMs = options.minSilenceMs || 400;
    const hardSplitWindowSec = options.hardSplitWindowSec || 30;
    const enablePreprocessing = options.enablePreprocessing !== false; // Default true

    // Get FFmpeg path
    if (!this.ffmpegPath) {
      this.ffmpegPath = await this.getFFmpegPath();
      if (!this.ffmpegPath) {
        console.warn('FFmpeg is not available. Falling back to simple time-based segmentation.');
        return this.fallbackSegmentation(input, options, maxSizeBytes, maxDurationSec, hardSplitWindowSec);
      }
    }

    // Prepare input file
    let inputPath = await this.prepareInputFile(input);
    let tempFiles: string[] = [];

    // Add original input to cleanup if it's a temp file
    if (typeof input !== 'string') {
      tempFiles.push(inputPath);
    }

    // Preprocess audio if enabled
    if (enablePreprocessing) {
      const preprocessedPath = await this.preprocessAudio(inputPath, options);
      if (preprocessedPath !== inputPath) {
        tempFiles.push(preprocessedPath);
        inputPath = preprocessedPath;
        console.log('Audio preprocessing completed');
      }
    }

    try {
      // Get audio metadata
      const metadata = await this.getAudioMetadata(inputPath);
      console.log(`Audio metadata: ${metadata.duration}s, ${metadata.sampleRate}Hz, ${metadata.channels}ch`);

      // Check if segmentation is needed
      const inputSize = await this.getFileSize(inputPath);
      if (inputSize <= maxSizeBytes && metadata.duration <= maxDurationSec) {
        // Return single segment
        return [{
          bufferOrPath: await this.readInputAsBuffer(input, inputPath),
          startSec: 0,
          endSec: metadata.duration,
          sizeBytes: inputSize
        }];
      }

      // Detect silence intervals
      const silenceIntervals = await this.detectSilence(inputPath, silenceThresholdDb, minSilenceMs / 1000);
      console.log(`Detected ${silenceIntervals.length} silence intervals`);

      // Generate split points based on silence and constraints
      const splitPoints = this.generateSplitPoints(
        silenceIntervals,
        metadata.duration,
        maxDurationSec,
        hardSplitWindowSec
      );

      console.log(`Generated ${splitPoints.length + 1} segments with split points: ${splitPoints.join(', ')}`);

      // Split audio into segments
      const segments = await this.splitAudioIntoSegments(
        inputPath,
        splitPoints,
        metadata.duration,
        options.preserveIntermediates || false
      );

      // Track temp files for cleanup
      if (!options.preserveIntermediates) {
        tempFiles.push(...segments.map(s => typeof s.bufferOrPath === 'string' ? s.bufferOrPath : '').filter(Boolean));
      }

      return segments;

    } finally {
      // Cleanup temp files
      if (!options.preserveIntermediates) {
        this.cleanupTempFiles(tempFiles);
      }
    }
  }

  private async getFFmpegPath(): Promise<string | null> {
    // First try user-configured path if provided
    if (this.userFfmpegPath && this.userFfmpegPath.trim() !== '') {
      try {
        await execAsync(`"${this.userFfmpegPath}" -version`);
        return this.userFfmpegPath;
      } catch (error) {
        console.warn(`User-configured FFmpeg path "${this.userFfmpegPath}" is not valid:`, error);
      }
    }

    // Fall back to common system paths
    const candidates = [
      'ffmpeg', // System PATH
      '/usr/bin/ffmpeg', // Standard Linux/Unix
      '/usr/local/bin/ffmpeg', // Homebrew (older)
      '/opt/homebrew/bin/ffmpeg', // Homebrew (Apple Silicon)
      'C:\\ffmpeg\\bin\\ffmpeg.exe' // Windows
    ];

    for (const candidate of candidates) {
      try {
        await execAsync(`"${candidate}" -version`);
        return candidate;
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  private async preprocessAudio(inputPath: string, options: SegmentOptions): Promise<string> {
    const targetSampleRate = options.targetSampleRateHz || 16000;
    const targetChannels = options.targetChannels || 1;
    const audioCodec = options.audioCodec || 'aac';
    const audioBitrate = options.audioBitrate || '128k';

    const timestamp = Date.now();
    const outputPath = join(this.tempDir, `preprocessed_${timestamp}.m4a`);

    // Build FFmpeg command for preprocessing
    const filters: string[] = [];

    // Add sample rate conversion
    filters.push(`aresample=${targetSampleRate}`);

    // Add channel conversion (mono/stereo)
    if (targetChannels === 1) {
      filters.push('pan=mono|c0=0.5*c0+0.5*c1');
    }

    // Add volume normalization to improve silence detection
    filters.push('dynaudnorm=f=75:g=25:s=10');

    const filterComplex = filters.join(',');

    const command = `"${this.ffmpegPath}" -i "${inputPath}" -af "${filterComplex}" -c:a ${audioCodec} -b:a ${audioBitrate} -y "${outputPath}"`;

    try {
      await execAsync(command);
      console.log(`Audio preprocessed: ${targetSampleRate}Hz, ${targetChannels}ch, ${audioCodec}@${audioBitrate}`);
      return outputPath;
    } catch (error) {
      console.warn('Audio preprocessing failed, using original:', error);
      return inputPath;
    }
  }

  private async prepareInputFile(input: File | Buffer | string): Promise<string> {
    if (typeof input === 'string') {
      // Already a file path
      return input;
    }

    // Convert File or Buffer to temporary file
    const timestamp = Date.now();
    const inputPath = join(this.tempDir, `input_${timestamp}.m4a`);

    if (input instanceof File) {
      const arrayBuffer = await input.arrayBuffer();
      writeFileSync(inputPath, new Uint8Array(arrayBuffer));
    } else if (Buffer.isBuffer(input)) {
      writeFileSync(inputPath, input);
    }

    return inputPath;
  }

  private async getAudioMetadata(inputPath: string): Promise<AudioMetadata> {
    const command = `"${this.ffmpegPath}" -i "${inputPath}" -f null - 2>&1`;
    const { stderr } = await execAsync(command).catch(result => result);

    // Parse duration
    const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    const duration = durationMatch
      ? parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3])
      : 0;

    // Parse sample rate and channels
    const streamMatch = stderr.match(/Stream #\d+:\d+.*Audio: (\w+).*?(\d+) Hz.*?(\d+) channels?/);
    const codec = streamMatch ? streamMatch[1] : 'unknown';
    const sampleRate = streamMatch ? parseInt(streamMatch[2]) : 44100;
    const channels = streamMatch ? parseInt(streamMatch[3]) : 2;

    // Parse bitrate
    const bitrateMatch = stderr.match(/bitrate: (\d+) kb\/s/);
    const bitRate = bitrateMatch ? parseInt(bitrateMatch[1]) : undefined;

    return {
      duration,
      sampleRate,
      channels,
      codec,
      bitRate
    };
  }

  private async detectSilence(inputPath: string, thresholdDb: number, minDurationSec: number): Promise<SilenceInterval[]> {
    // Use silencedetect filter to find silence intervals
    const command = `"${this.ffmpegPath}" -i "${inputPath}" -af "silencedetect=noise=${thresholdDb}dB:duration=${minDurationSec}" -f null - 2>&1`;
    
    const { stderr } = await execAsync(command).catch(result => result);

    const silenceIntervals: SilenceInterval[] = [];
    const lines = stderr.split('\n');

    let currentStart: number | null = null;

    for (const line of lines) {
      const silenceStartMatch = line.match(/silence_start: ([\d.]+)/);
      const silenceEndMatch = line.match(/silence_end: ([\d.]+)/);

      if (silenceStartMatch) {
        currentStart = parseFloat(silenceStartMatch[1]);
      } else if (silenceEndMatch && currentStart !== null) {
        const end = parseFloat(silenceEndMatch[1]);
        silenceIntervals.push({
          start: currentStart,
          end: end
        });
        currentStart = null;
      }
    }

    return silenceIntervals.sort((a, b) => a.start - b.start);
  }

  private generateSplitPoints(
    silenceIntervals: SilenceInterval[],
    totalDuration: number,
    maxDurationSec: number,
    hardSplitWindowSec: number
  ): number[] {
    const splitPoints: number[] = [];
    let lastSplitPoint = 0;

    for (const silence of silenceIntervals) {
      const segmentDuration = silence.start - lastSplitPoint;
      
      // If this segment would be too long, split at this silence
      if (segmentDuration > maxDurationSec) {
        // Choose split point at the middle of the silence interval
        const splitPoint = (silence.start + silence.end) / 2;
        splitPoints.push(splitPoint);
        lastSplitPoint = splitPoint;
      }
    }

    // Handle remaining audio if it's too long
    if (totalDuration - lastSplitPoint > maxDurationSec) {
      // Add hard splits every hardSplitWindowSec seconds
      let currentPoint = lastSplitPoint + hardSplitWindowSec;
      while (currentPoint < totalDuration) {
        splitPoints.push(currentPoint);
        currentPoint += hardSplitWindowSec;
      }
    }

    return splitPoints.filter(point => point > 0 && point < totalDuration);
  }

  private async splitAudioIntoSegments(
    inputPath: string,
    splitPoints: number[],
    totalDuration: number,
    preserveIntermediates: boolean
  ): Promise<SegmentResult[]> {
    const segments: SegmentResult[] = [];
    const allPoints = [0, ...splitPoints, totalDuration];

    for (let i = 0; i < allPoints.length - 1; i++) {
      const startSec = allPoints[i];
      const endSec = allPoints[i + 1];
      const duration = endSec - startSec;

      if (duration < 0.1) continue; // Skip very short segments

      const timestamp = Date.now();
      const segmentPath = join(this.tempDir, `segment_${i}_${timestamp}.m4a`);

      // Extract segment using FFmpeg
      const command = `"${this.ffmpegPath}" -i "${inputPath}" -ss ${startSec} -t ${duration} -c copy -avoid_negative_ts make_zero "${segmentPath}"`;
      await execAsync(command);

      const sizeBytes = this.getFileSize(segmentPath);

      if (preserveIntermediates) {
        // Return file path for preserved files
        segments.push({
          bufferOrPath: segmentPath,
          startSec,
          endSec,
          sizeBytes
        });
      } else {
        // Read into buffer for temporary files
        const buffer = readFileSync(segmentPath);
        segments.push({
          bufferOrPath: buffer,
          startSec,
          endSec,
          sizeBytes
        });
      }
    }

    return segments;
  }

  private async readInputAsBuffer(input: File | Buffer | string, inputPath?: string): Promise<Buffer> {
    if (Buffer.isBuffer(input)) {
      return input;
    } else if (input instanceof File) {
      const arrayBuffer = await input.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else if (inputPath) {
      return readFileSync(inputPath);
    } else {
      return readFileSync(input);
    }
  }

  private getFileSize(filePath: string): number {
    return statSync(filePath).size;
  }

  private ensureTempDir(): void {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private cleanupTempFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      try {
        if (filePath && existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${filePath}:`, error);
      }
    }
  }

  private async fallbackSegmentation(
    input: File | Buffer | string,
    options: SegmentOptions,
    maxSizeBytes: number,
    maxDurationSec: number,
    hardSplitWindowSec: number
  ): Promise<SegmentResult[]> {
    console.log('Using fallback segmentation without FFmpeg');

    const inputSize = await this.getInputSize(input);
    
    // If input is small enough, return as single segment
    if (inputSize <= maxSizeBytes) {
      console.log(`File size ${(inputSize / 1024 / 1024).toFixed(2)}MB is within limit, no segmentation needed`);
      return [{
        bufferOrPath: await this.readInputAsBuffer(input),
        startSec: 0,
        endSec: this.estimateAudioDuration(inputSize),
        sizeBytes: inputSize
      }];
    }

    // Estimate audio duration based on file size
    const estimatedDurationSec = this.estimateAudioDuration(inputSize);
    console.log(`Estimated audio duration: ${estimatedDurationSec.toFixed(2)} seconds`);

    // Calculate number of segments needed based on size and duration constraints
    const segmentsBySize = Math.ceil(inputSize / maxSizeBytes);
    const segmentsByDuration = Math.ceil(estimatedDurationSec / maxDurationSec);
    const totalSegments = Math.max(segmentsBySize, segmentsByDuration, Math.ceil(estimatedDurationSec / hardSplitWindowSec));

    console.log(`Creating ${totalSegments} segments (by size: ${segmentsBySize}, by duration: ${segmentsByDuration})`);

    const segments: SegmentResult[] = [];
    const actualDurationPerSegment = estimatedDurationSec / totalSegments;
    const actualSizePerSegment = inputSize / totalSegments;

    const inputBuffer = await this.readInputAsBuffer(input);

    for (let i = 0; i < totalSegments; i++) {
      const startSec = i * actualDurationPerSegment;
      const endSec = Math.min((i + 1) * actualDurationPerSegment, estimatedDurationSec);
      
      // Calculate buffer slice based on proportional size
      const startByte = Math.floor((i / totalSegments) * inputSize);
      const endByte = Math.floor(((i + 1) / totalSegments) * inputSize);
      const segmentBuffer = inputBuffer.slice(startByte, endByte);

      segments.push({
        bufferOrPath: segmentBuffer,
        startSec,
        endSec,
        sizeBytes: segmentBuffer.length
      });

      console.log(`Fallback segment ${i + 1}: ${startSec.toFixed(2)}s-${endSec.toFixed(2)}s, ${(segmentBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    }

    return segments;
  }

  private async getInputSize(input: File | Buffer | string): Promise<number> {
    if (input instanceof File) {
      return input.size;
    } else if (Buffer.isBuffer(input)) {
      return input.length;
    } else {
      // For file paths, use fs.stat
      try {
        const stats = statSync(input);
        return stats.size;
      } catch (error) {
        console.warn(`Failed to get file size for ${input}:`, error);
        return 25 * 1024 * 1024; // Default to 25MB
      }
    }
  }

  private estimateAudioDuration(sizeBytes: number): number {
    // Rough estimate: assume ~1MB per minute for compressed audio
    // This is just a fallback estimate when FFmpeg is not available
    const estimatedMinutes = sizeBytes / (1024 * 1024);
    return estimatedMinutes * 60; // Convert to seconds
  }
}