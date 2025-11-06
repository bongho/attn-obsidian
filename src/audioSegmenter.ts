import { SegmentOptions, SegmentResult } from './types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, readFileSync, statSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { VadDetector, VadSegment } from './utils/vadDetector';

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
  private segmentCache: Map<string, SegmentResult[]> = new Map();
  private vadDetector: VadDetector | null = null;
  private performanceMetrics: {
    totalProcessingTime: number;
    segmentationTime: number;
    silenceDetectionTime: number;
    cacheHitRate: number;
  } = {
    totalProcessingTime: 0,
    segmentationTime: 0,
    silenceDetectionTime: 0,
    cacheHitRate: 0
  };

  constructor(userFfmpegPath?: string) {
    this.tempDir = join(tmpdir(), 'attn-audio-segmenter');
    this.userFfmpegPath = userFfmpegPath;
    this.ensureTempDir();
  }

  getPerformanceMetrics() {
    return { ...this.performanceMetrics };
  }

  clearCache(): void {
    this.segmentCache.clear();
    console.log('Audio segmentation cache cleared');
  }

  async segmentAudio(input: File | Buffer | string, options: SegmentOptions): Promise<SegmentResult[]> {
    const startTime = Date.now();
    
    // Generate cache key for this input
    const cacheKey = await this.generateCacheKey(input, options);
    
    // Check cache first
    if (this.segmentCache.has(cacheKey)) {
      console.log('Cache hit: Using cached segmentation result');
      this.performanceMetrics.cacheHitRate = (this.performanceMetrics.cacheHitRate + 1) / 2; // Simple rolling average
      return this.segmentCache.get(cacheKey)!;
    }
    
    const maxSizeMB = options.maxUploadSizeMB || 24.5;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const maxDurationSec = options.maxChunkDurationSec || 150; // Increased default for ultra-long meetings
    const silenceThresholdDb = options.silenceThresholdDb || -30; // Enhanced default
    const minSilenceMs = options.minSilenceMs || 300; // Faster segmentation
    const hardSplitWindowSec = options.hardSplitWindowSec || 120; // Longer hard splits
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

      // Detect silence intervals with timing
      const silenceStartTime = Date.now();
      const silenceIntervals = await this.detectSilence(inputPath, silenceThresholdDb, minSilenceMs / 1000);
      this.performanceMetrics.silenceDetectionTime = Date.now() - silenceStartTime;
      
      console.log(`Detected ${silenceIntervals.length} silence intervals in ${this.performanceMetrics.silenceDetectionTime}ms`);
      
      // Log silence interval statistics
      if (silenceIntervals.length > 0) {
        const avgSilenceDuration = silenceIntervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0) / silenceIntervals.length;
        console.log(`Average silence duration: ${avgSilenceDuration.toFixed(2)}s`);
      }

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

      // Cache the result for future use
      this.segmentCache.set(cacheKey, segments);
      console.log(`Segmentation result cached with key: ${cacheKey.substring(0, 8)}...`);
      
      // Update performance metrics
      this.performanceMetrics.totalProcessingTime = Date.now() - startTime;
      this.performanceMetrics.segmentationTime = this.performanceMetrics.totalProcessingTime;
      
      console.log(`Segmentation completed in ${this.performanceMetrics.totalProcessingTime}ms`);
      
      return segments;

    } finally {
      // Cleanup temp files
      if (!options.preserveIntermediates) {
        this.cleanupTempFiles(tempFiles);
      }
    }
  }

  private async generateCacheKey(input: File | Buffer | string, options: SegmentOptions): Promise<string> {
    // Create a hash of input and options for cache key
    const crypto = require('crypto');
    
    let inputIdentifier: string;
    if (typeof input === 'string') {
      // For file paths, use path + file size + modification time
      const fs = require('fs');
      const stats = fs.statSync(input);
      inputIdentifier = `${input}:${stats.size}:${stats.mtime.getTime()}`;
    } else if (input instanceof File) {
      // For File objects, use name + size + last modified
      inputIdentifier = `${input.name}:${input.size}:${input.lastModified}`;
    } else {
      // For Buffer, use content hash
      inputIdentifier = crypto.createHash('md5').update(input).digest('hex');
    }
    
    const optionsString = JSON.stringify({
      maxUploadSizeMB: options.maxUploadSizeMB,
      maxChunkDurationSec: options.maxChunkDurationSec,
      silenceThresholdDb: options.silenceThresholdDb,
      minSilenceMs: options.minSilenceMs,
      hardSplitWindowSec: options.hardSplitWindowSec,
      enablePreprocessing: options.enablePreprocessing
    });
    
    return crypto.createHash('sha256').update(inputIdentifier + optionsString).digest('hex');
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
    // Try VAD-based detection first (more accurate than FFmpeg silencedetect)
    try {
      const vadIntervals = await this.detectSilenceWithVAD(inputPath, minDurationSec);
      if (vadIntervals && vadIntervals.length > 0) {
        console.log(`VAD-based silence detection found ${vadIntervals.length} intervals`);
        return vadIntervals;
      }
    } catch (error) {
      console.warn('VAD-based detection failed, falling back to FFmpeg silencedetect:', error);
    }

    // Fallback to FFmpeg silencedetect
    try {
      // First pass: Standard silence detection
      const primaryIntervals = await this.detectSilencePass(inputPath, thresholdDb, minDurationSec);

      // If we don't find enough silence intervals for long audio, try with relaxed threshold
      if (primaryIntervals.length < 5 && thresholdDb < -25) {
        const relaxedThreshold = Math.max(-40, thresholdDb - 5);
        console.log(`Insufficient silence intervals found (${primaryIntervals.length}), trying relaxed threshold: ${relaxedThreshold}dB`);

        const secondaryIntervals = await this.detectSilencePass(inputPath, relaxedThreshold, minDurationSec * 0.7);

        // Merge and deduplicate intervals
        const allIntervals = [...primaryIntervals, ...secondaryIntervals];
        return this.mergeSilenceIntervals(allIntervals);
      }

      return primaryIntervals;

    } catch (error) {
      console.warn('Silence detection failed, using fallback method:', error);
      // Fallback: Create artificial silence intervals based on audio duration
      return this.generateFallbackSilenceIntervals(inputPath);
    }
  }

  /**
   * VAD-based silence detection (more accurate than energy-based silencedetect)
   * Converts voice segments to silence intervals
   */
  private async detectSilenceWithVAD(inputPath: string, minDurationSec: number): Promise<SilenceInterval[] | null> {
    if (!this.ffmpegPath) {
      return null; // Need FFmpeg to extract PCM audio
    }

    // Initialize VAD detector if not already done
    if (!this.vadDetector) {
      try {
        this.vadDetector = new VadDetector({
          sampleRate: 16000,
          threshold: 0.5,
          minSilenceDurationMs: minDurationSec * 1000,
          speechPadMs: 100,
          frameSizeMs: 32
        });
        await this.vadDetector.initialize();
      } catch (error) {
        console.warn('Failed to initialize VAD detector:', error);
        return null;
      }
    }

    // Extract audio as 16kHz mono PCM using FFmpeg
    const timestamp = Date.now();
    const pcmPath = join(this.tempDir, `vad_${timestamp}.pcm`);

    try {
      // Convert to 16kHz mono PCM (raw audio data)
      const command = `"${this.ffmpegPath}" -i "${inputPath}" -f f32le -acodec pcm_f32le -ac 1 -ar 16000 -y "${pcmPath}"`;
      await execAsync(command);

      // Read PCM data
      const pcmData = readFileSync(pcmPath);
      const audioSamples = new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 4);

      // Reset VAD state for new audio
      this.vadDetector.reset();

      // Detect voice segments
      const voiceSegments = await this.vadDetector.processAudio(audioSamples);

      // Check for pending segment
      const finalSegment = this.vadDetector.finalize();
      if (finalSegment) {
        voiceSegments.push(finalSegment);
      }

      // Convert voice segments to silence intervals
      const silenceIntervals = this.convertVoiceSegmentsToSilence(voiceSegments, minDurationSec);

      // Cleanup PCM file
      if (existsSync(pcmPath)) {
        unlinkSync(pcmPath);
      }

      return silenceIntervals;

    } catch (error) {
      // Cleanup on error
      if (existsSync(pcmPath)) {
        unlinkSync(pcmPath);
      }
      throw error;
    }
  }

  /**
   * Convert voice activity segments to silence intervals
   * Silence is the gaps between voice segments
   */
  private convertVoiceSegmentsToSilence(voiceSegments: VadSegment[], minDurationSec: number): SilenceInterval[] {
    if (voiceSegments.length === 0) {
      return [];
    }

    const silenceIntervals: SilenceInterval[] = [];

    // Sort voice segments by start time
    voiceSegments.sort((a, b) => a.start - b.start);

    // Find gaps between voice segments
    for (let i = 0; i < voiceSegments.length - 1; i++) {
      const currentEnd = voiceSegments[i].end;
      const nextStart = voiceSegments[i + 1].start;

      const silenceDuration = nextStart - currentEnd;

      // Only include silence longer than minimum duration
      if (silenceDuration >= minDurationSec) {
        silenceIntervals.push({
          start: currentEnd,
          end: nextStart
        });
      }
    }

    return silenceIntervals;
  }

  private async detectSilencePass(inputPath: string, thresholdDb: number, minDurationSec: number): Promise<SilenceInterval[]> {
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

  private mergeSilenceIntervals(intervals: SilenceInterval[]): SilenceInterval[] {
    if (intervals.length === 0) return [];
    
    // Sort by start time
    intervals.sort((a, b) => a.start - b.start);
    
    const merged: SilenceInterval[] = [];
    let current = intervals[0];
    
    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i];
      
      // Merge overlapping or adjacent intervals (within 0.5 seconds)
      if (next.start <= current.end + 0.5) {
        current.end = Math.max(current.end, next.end);
      } else {
        merged.push(current);
        current = next;
      }
    }
    
    merged.push(current);
    return merged;
  }

  private async generateFallbackSilenceIntervals(inputPath: string): Promise<SilenceInterval[]> {
    // Get audio metadata for duration
    const metadata = await this.getAudioMetadata(inputPath);
    const totalDuration = metadata.duration;
    
    // Create artificial silence intervals every 180 seconds (3 minutes)
    const intervals: SilenceInterval[] = [];
    const intervalSpacing = 180; // 3 minutes
    
    for (let time = intervalSpacing; time < totalDuration; time += intervalSpacing) {
      intervals.push({
        start: time - 0.5,
        end: time + 0.5
      });
    }
    
    console.log(`Generated ${intervals.length} fallback silence intervals for ${totalDuration.toFixed(1)}s audio`);
    return intervals;
  }

  private generateSplitPoints(
    silenceIntervals: SilenceInterval[],
    totalDuration: number,
    maxDurationSec: number,
    hardSplitWindowSec: number
  ): number[] {
    const splitPoints: number[] = [];
    let lastSplitPoint = 0;
    let segmentCount = 0;
    
    // Dynamic adjustment for ultra-long meetings
    const isUltraLong = totalDuration > 3600; // Over 1 hour
    const adjustedMaxDuration = isUltraLong ? Math.max(maxDurationSec, 150) : maxDurationSec;
    const adjustedHardSplit = isUltraLong ? Math.max(hardSplitWindowSec, 120) : hardSplitWindowSec;
    
    console.log(`Generating split points for ${totalDuration.toFixed(1)}s audio (${isUltraLong ? 'ultra-long' : 'standard'} mode)`);
    console.log(`Using max duration: ${adjustedMaxDuration}s, hard split: ${adjustedHardSplit}s`);

    // Smart splitting algorithm
    for (const silence of silenceIntervals) {
      const segmentDuration = silence.start - lastSplitPoint;
      
      // Prefer silence-based splits when segment exceeds target duration
      if (segmentDuration > adjustedMaxDuration * 0.8) { // 80% threshold for early splitting
        // Choose optimal split point within silence interval
        const silenceDuration = silence.end - silence.start;
        let splitPoint: number;
        
        if (silenceDuration > 1.0) {
          // Long silence: split in the middle
          splitPoint = (silence.start + silence.end) / 2;
        } else {
          // Short silence: split at the end to preserve speech
          splitPoint = silence.end;
        }
        
        splitPoints.push(splitPoint);
        lastSplitPoint = splitPoint;
        segmentCount++;
        
        console.log(`Silence-based split ${segmentCount} at ${splitPoint.toFixed(1)}s (segment duration: ${segmentDuration.toFixed(1)}s)`);
      }
    }

    // Handle remaining audio with adaptive hard splitting
    let remainingDuration = totalDuration - lastSplitPoint;
    if (remainingDuration > adjustedMaxDuration) {
      console.log(`Applying hard splits for remaining ${remainingDuration.toFixed(1)}s`);
      
      // Calculate optimal split size for remaining audio
      const remainingSegments = Math.ceil(remainingDuration / adjustedMaxDuration);
      const optimalSplitSize = remainingDuration / remainingSegments;
      
      let currentPoint = lastSplitPoint + optimalSplitSize;
      while (currentPoint < totalDuration - 10) { // Leave at least 10s for final segment
        splitPoints.push(currentPoint);
        segmentCount++;
        console.log(`Hard split ${segmentCount} at ${currentPoint.toFixed(1)}s`);
        currentPoint += optimalSplitSize;
      }
    }

    const validSplitPoints = splitPoints.filter(point => point > 5 && point < totalDuration - 5);
    const estimatedSegments = validSplitPoints.length + 1;
    const avgSegmentDuration = totalDuration / estimatedSegments;
    
    console.log(`Generated ${validSplitPoints.length} split points (${estimatedSegments} segments, avg ${avgSegmentDuration.toFixed(1)}s each)`);
    
    return validSplitPoints;
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
    
    console.log(`🔍 FALLBACK: Input size ${(inputSize / 1024 / 1024).toFixed(2)}MB, limit ${(maxSizeBytes / 1024 / 1024).toFixed(2)}MB`);
    
    // Without FFmpeg, we cannot safely split audio files by byte slicing
    // Audio files have headers and structure that cannot be arbitrarily divided
    // Instead, we'll return the whole file as a single segment and let the STT provider handle it
    
    console.log('🔍 FALLBACK: Without FFmpeg, returning entire file as single segment');
    console.log('🔍 FALLBACK: STT provider will need to handle potential size limits');
    
    const estimatedDurationSec = this.estimateAudioDuration(inputSize);
    
    try {
      const buffer = await this.readInputAsBuffer(input);
      
      console.log(`🔍 FALLBACK: Successfully created buffer of ${buffer.byteLength} bytes`);
      
      const segment: SegmentResult = {
        bufferOrPath: buffer,
        startSec: 0,
        endSec: estimatedDurationSec,
        sizeBytes: inputSize
      };
      
      console.log(`🔍 FALLBACK: Returning 1 segment covering ${estimatedDurationSec.toFixed(1)}s`);
      
      return [segment];
      
    } catch (error) {
      console.error('🚨 FALLBACK: Failed to read input as buffer:', error);
      throw new Error(`Failed to process audio file in fallback mode: ${error.message}`);
    }
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