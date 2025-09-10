import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { AudioSpeedOption, ATTNSettings, VerboseTranscriptionResult, SegmentResult, SegmentOptions } from './types';
import { AudioSegmenter } from './audioSegmenter';
import { Logger, LogContext } from './logger';
import { ApiService } from './apiService';
import { SpeakerDiarizationService } from './speakerDiarization';

const execAsync = promisify(exec);

export class AudioProcessor {
  private tempDir: string;
  private ffmpegPath: string | null = null;
  private userFfmpegPath: string;
  private diarizationService?: SpeakerDiarizationService;

  constructor(userFfmpegPath: string = '') {
    // Use OS temp directory instead of process.cwd() to avoid permission issues in Obsidian
    this.tempDir = join(tmpdir(), 'attn-audio-processing');
    this.userFfmpegPath = userFfmpegPath;
  }

  private initializeDiarizationService(settings: ATTNSettings): void {
    if (settings.processing.diarization?.enabled && !this.diarizationService) {
      this.diarizationService = new SpeakerDiarizationService(settings.processing.diarization);
    }
  }

  async processAudioSpeed(audioFile: File, speedMultiplier: AudioSpeedOption): Promise<File> {
    // If no speed change requested, return original file
    if (speedMultiplier === 1) {
      return audioFile;
    }

    // Get ffmpeg path first
    if (!this.ffmpegPath) {
      this.ffmpegPath = await this.getFFmpegPath();
    }

    if (!this.ffmpegPath) {
      throw new Error('FFmpeg is not available on this system');
    }

    const inputPath = join(this.tempDir, `input_${Date.now()}.m4a`);
    const outputPath = join(this.tempDir, `output_${Date.now()}.m4a`);

    try {
      // Create temp directory if it doesn't exist
      await this.ensureTempDir();

      // Write input file to temp location
      const audioData = await audioFile.arrayBuffer();
      writeFileSync(inputPath, new Uint8Array(audioData));

      // Use ffmpeg to speed up audio
      const ffmpegCommand = `"${this.ffmpegPath}" -i "${inputPath}" -filter:a "atempo=${speedMultiplier}" -c:a aac "${outputPath}"`;
      
      await execAsync(ffmpegCommand);

      // Read processed audio back
      const processedData = require('fs').readFileSync(outputPath);
      const processedFile = new File([processedData], `processed_${audioFile.name}`, { 
        type: 'audio/m4a' 
      });

      return processedFile;

    } catch (error) {
      throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Clean up temp files
      this.cleanupTempFiles([inputPath, outputPath]);
    }
  }

  private async ensureTempDir(): Promise<void> {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.tempDir)) {
        // Create directory with full permissions for temp usage
        fs.mkdirSync(this.tempDir, { recursive: true, mode: 0o755 });
      }
    } catch (error) {
      console.error('Failed to create temp directory:', error);
      throw new Error(`Failed to create temp directory at ${this.tempDir}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private cleanupTempFiles(filePaths: string[]): void {
    filePaths.forEach(filePath => {
      try {
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${filePath}:`, error);
      }
    });
  }

  private async getFFmpegPath(): Promise<string | null> {
    // First try user-configured path if provided
    if (this.userFfmpegPath && this.userFfmpegPath.trim() !== '') {
      try {
        await execAsync(`"${this.userFfmpegPath}" -version`);
        return this.userFfmpegPath;
      } catch (error) {
        console.warn(`User-configured ffmpeg path "${this.userFfmpegPath}" is not valid:`, error);
      }
    }

    // Fall back to common system paths
    const ffmpegPaths = [
      'ffmpeg', // System PATH
      '/usr/bin/ffmpeg', // Standard Linux/Unix
      '/usr/local/bin/ffmpeg', // Homebrew (older)
      '/opt/homebrew/bin/ffmpeg', // Homebrew (Apple Silicon)
      'C:\\ffmpeg\\bin\\ffmpeg.exe' // Windows
    ];

    for (const ffmpegPath of ffmpegPaths) {
      try {
        await execAsync(`"${ffmpegPath}" -version`);
        return ffmpegPath;
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  async checkFFmpegAvailability(): Promise<boolean> {
    try {
      const path = await this.getFFmpegPath();
      return path !== null;
    } catch (error) {
      return false;
    }
  }

  async transcribeWithRetry(audioFile: File, settings: ATTNSettings): Promise<VerboseTranscriptionResult> {
    const requestId = uuidv4();
    const logger = new Logger(settings.logging);
    const apiService = new ApiService(settings);
    
    // Initialize diarization service if needed
    this.initializeDiarizationService(settings);
    
    const logContext: LogContext = {
      requestId,
      provider: settings.stt.provider,
      model: settings.stt.model,
      filePath: audioFile.name,
      durationSec: this.estimateFileDuration(audioFile.size),
      sizeBytes: audioFile.size
    };

    // Attempt direct transcription with retry logic
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiService.transcribeAudio(audioFile, { format: 'verbose_json' });
        
        // Apply speaker diarization if enabled
        if (this.diarizationService) {
          return await this.diarizationService.enhanceTranscriptionWithSpeakers(result, audioFile);
        }
        
        return result;
        
      } catch (error) {
        const errorStatus = (error as any).status || (error as any).response?.status;
        const errorMessage = (error as any).message || String(error);
        const errorCode = (error as any).code;

        // Handle network/server errors with retry
        if (this.shouldRetry(errorStatus, errorCode) && attempt < maxRetries) {
          const delayMs = Math.min(500 * Math.pow(2, attempt - 1), 2000); // Exponential backoff: 500ms, 1s, 2s
          
          await logger.log('warn', {
            ...logContext,
            message: `Network error, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`,
            attempt,
            status: errorStatus,
            errorCode,
            errorMessage
          });

          await this.sleep(delayMs);
          continue;
        }

        // Final attempt failed or non-retryable error
        await logger.logError({
          ...logContext,
          status: errorStatus,
          responseBody: (error as any).response?.data
        }, error);
        
        throw error;
      }
    }

    throw new Error('Retry logic error - should not reach here');
  }

  async transcribeWithChunking(audioFile: File, settings: ATTNSettings): Promise<VerboseTranscriptionResult> {
    const requestId = uuidv4();
    const logger = new Logger(settings.logging);
    const segmenter = new AudioSegmenter(this.userFfmpegPath);
    
    // Initialize diarization service if needed
    this.initializeDiarizationService(settings);
    
    const logContext: LogContext = {
      requestId,
      provider: settings.stt.provider,
      model: settings.stt.model,
      filePath: audioFile.name,
      durationSec: this.estimateFileDuration(audioFile.size),
      sizeBytes: audioFile.size
    };

    try {
      // Segment the audio file
      const segmentOptions: SegmentOptions = {
        maxUploadSizeMB: settings.processing.maxUploadSizeMB,
        maxChunkDurationSec: settings.processing.maxChunkDurationSec,
        targetSampleRateHz: settings.processing.targetSampleRateHz,
        targetChannels: settings.processing.targetChannels,
        silenceThresholdDb: settings.processing.silenceThresholdDb,
        minSilenceMs: settings.processing.minSilenceMs,
        hardSplitWindowSec: settings.processing.hardSplitWindowSec,
        preserveIntermediates: settings.processing.preserveIntermediates,
        enablePreprocessing: true, // Enable audio preprocessing for better results
        audioCodec: 'aac',
        audioBitrate: '128k'
      };

      const segments = await segmenter.segmentAudio(audioFile, segmentOptions);
      
      // Validate segments have consistent timeline
      this.validateSegmentTimeline(segments);
      
      await logger.log('info', {
        ...logContext,
        message: `Segmented audio into ${segments.length} chunks`,
        chunkCount: segments.length
      });

      // Process each segment
      const chunkResults: VerboseTranscriptionResult[] = [];
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const chunkLogContext = {
          ...logContext,
          chunkIndex: i,
          chunkCount: segments.length,
          durationSec: segment.endSec - segment.startSec,
          sizeBytes: segment.sizeBytes
        };

        try {
          // Convert segment to File object for API
          const chunkFile = await this.segmentToFile(segment, `${audioFile.name}_chunk_${i}`);
          
          // Transcribe chunk with simple retry (no chunking recursion)
          const chunkResult = await this.transcribeChunkWithRetry(chunkFile, settings, chunkLogContext, logger);
          chunkResults.push(chunkResult);
          
          await logger.log('info', {
            ...chunkLogContext,
            message: `Successfully transcribed chunk ${i + 1}/${segments.length}`
          });

        } catch (error) {
          await logger.logError(chunkLogContext, error);
          throw new Error(`Failed to transcribe chunk ${i}: ${(error as Error).message}`);
        }
      }

      // Merge results with timeline correction
      let mergedResult = this.mergeVerboseResults(chunkResults, segments);
      
      // Apply speaker diarization to the complete merged result if enabled
      if (this.diarizationService) {
        mergedResult = await this.diarizationService.enhanceTranscriptionWithSpeakers(mergedResult, audioFile);
        
        await logger.log('info', {
          ...logContext,
          message: 'Applied speaker diarization to merged result',
          speakerCount: mergedResult.speakers?.length || 0
        });
      }
      
      await logger.log('info', {
        ...logContext,
        message: 'Successfully merged all chunks',
        finalDuration: mergedResult.duration,
        totalSegments: mergedResult.segments.length,
        speakerCount: mergedResult.speakers?.length || 0
      });

      return mergedResult;
      
    } catch (error) {
      await logger.logError({
        ...logContext
      }, error);
      throw error;
    }
  }

  mergeVerboseResults(chunkResults: VerboseTranscriptionResult[], segments: SegmentResult[]): VerboseTranscriptionResult {
    const combinedText = chunkResults.map(result => result.text).join(' ');
    const combinedSegments = [];
    const rawChunks = [];
    
    let segmentId = 0;
    for (let i = 0; i < chunkResults.length; i++) {
      const chunkResult = chunkResults[i];
      const segmentOffset = segments[i].startSec;
      
      // Collect raw data
      if (chunkResult.raw) {
        rawChunks.push(chunkResult.raw);
      }
      
      // Merge segments with timeline offset
      if (chunkResult.segments) {
        for (const segment of chunkResult.segments) {
          combinedSegments.push({
            id: segmentId++,
            start: segment.start + segmentOffset,
            end: segment.end + segmentOffset,
            text: segment.text,
            words: segment.words?.map(word => ({
              start: word.start + segmentOffset,
              end: word.end + segmentOffset,
              word: word.word
            }))
          });
        }
      }
    }

    return {
      text: combinedText,
      language: chunkResults[0]?.language,
      duration: segments[segments.length - 1]?.endSec || 0,
      segments: combinedSegments,
      raw: { chunks: rawChunks }
    };
  }

  private validateSegmentTimeline(segments: SegmentResult[]): void {
    for (let i = 1; i < segments.length; i++) {
      const prevEnd = segments[i - 1].endSec;
      const currentStart = segments[i].startSec;
      
      if (Math.abs(currentStart - prevEnd) > 1.0) { // Allow 1 second tolerance
        throw new Error(`Timeline gap detected between segments ${i - 1} and ${i}: ${prevEnd}s to ${currentStart}s`);
      }
    }
  }

  private async segmentToFile(segment: SegmentResult, filename: string): Promise<File> {
    if (Buffer.isBuffer(segment.bufferOrPath)) {
      return new File([segment.bufferOrPath], filename, { type: 'audio/m4a' });
    } else {
      // For file path, read the file - this is a stub implementation
      const fs = require('fs');
      const buffer = fs.readFileSync(segment.bufferOrPath);
      return new File([buffer], filename, { type: 'audio/m4a' });
    }
  }

  private async transcribeChunkWithRetry(
    chunkFile: File, 
    settings: ATTNSettings,
    logContext: LogContext, 
    logger: Logger
  ): Promise<VerboseTranscriptionResult> {
    const maxRetries = 2;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use direct STT provider instead of ApiService to avoid circular dependency
        const { createSttProvider } = await import('./providers/providerFactory');
        const { ConfigLoader } = await import('./configLoader');
        
        const config = ConfigLoader.getInstance();
        const effectiveSttSettings = {
          ...settings.stt,
          apiKey: settings.stt.apiKey || settings.openaiApiKey || config.getOpenAIApiKey() || '',
          language: settings.stt.language || config.getOpenAISettings()?.language || 'ko'
        };

        const sttProvider = createSttProvider(effectiveSttSettings);
        const audioBuffer = await chunkFile.arrayBuffer();
        
        return await sttProvider.transcribe(audioBuffer, {
          format: 'verbose_json',
          language: effectiveSttSettings.language,
          model: effectiveSttSettings.model
        });
      } catch (error) {
        const errorStatus = (error as any).status || (error as any).response?.status;
        const errorCode = (error as any).code;
        
        if (this.shouldRetry(errorStatus, errorCode) && attempt < maxRetries) {
          const delayMs = 500 * attempt; // Simple linear backoff for chunks
          await logger.log('warn', {
            ...logContext,
            message: `Chunk transcription failed, retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`,
            attempt,
            status: errorStatus,
            errorCode
          });
          
          await this.sleep(delayMs);
          continue;
        }
        
        throw error;
      }
    }
    
    throw new Error('Chunk retry logic error');
  }

  private is400FileLimit(errorMessage: string): boolean {
    const fileLimitKeywords = ['file too large', 'file is too large', 'audio too long', 'exceeds', 'limit', 'maximum'];
    const lowerMessage = errorMessage.toLowerCase();
    return fileLimitKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  private shouldRetry(status?: number, code?: string): boolean {
    // Retry on network errors and 5xx server errors
    if (code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(code)) {
      return true;
    }
    if (status && status >= 500 && status < 600) {
      return true;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private estimateFileDuration(sizeBytes: number): number {
    // Rough estimate: ~1MB per minute for compressed audio
    return (sizeBytes / (1024 * 1024)) * 60;
  }
}