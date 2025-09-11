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
    // Skip diarization initialization unless explicitly enabled and configured
    if (!settings.processing.diarization?.enabled || this.diarizationService) {
      return;
    }

    // Only attempt initialization if API key is provided
    if (!settings.processing.diarization.apiKey) {
      console.log('🎤 Speaker diarization disabled - no API key provided');
      settings.processing.diarization.enabled = false;
      return;
    }

    try {
      this.diarizationService = new SpeakerDiarizationService(settings.processing.diarization);
      console.log('🎤 Speaker diarization service initialized');
    } catch (error) {
      console.warn('🎤 Failed to initialize speaker diarization:', error);
      console.log('🎤 Continuing without speaker diarization');
      // Disable diarization in settings to prevent future attempts
      settings.processing.diarization.enabled = false;
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

      // Enhanced ffmpeg command for better quality at high speeds
      let ffmpegCommand: string;
      
      if (speedMultiplier >= 3) {
        // For 3x speed, use multiple atempo filters to avoid quality degradation
        // atempo filter supports max 2.0x per stage, so use cascade for higher speeds
        const stages = Math.ceil(Math.log2(speedMultiplier));
        const stageMultiplier = Math.pow(speedMultiplier, 1/stages);
        
        const atempoFilters = Array(stages).fill(0).map(() => `atempo=${stageMultiplier.toFixed(3)}`).join(',');
        
        // Add noise reduction and normalization for better quality
        ffmpegCommand = `"${this.ffmpegPath}" -i "${inputPath}" -af "${atempoFilters},highpass=f=80,lowpass=f=8000,dynaudnorm=f=75:g=25" -c:a aac -b:a 128k "${outputPath}"`;
      } else {
        // Standard processing for lower speeds
        ffmpegCommand = `"${this.ffmpegPath}" -i "${inputPath}" -filter:a "atempo=${speedMultiplier}" -c:a aac "${outputPath}"`;
      }
      
      console.log(`Processing audio with ${speedMultiplier}x speed...`);
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
    const logger = Logger.createLogger(settings.logging);
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
    const logger = Logger.createLogger(settings.logging);
    const segmenter = new AudioSegmenter(this.userFfmpegPath);
    
    // Initialize diarization service if needed
    this.initializeDiarizationService(settings);
    
    const estimatedDuration = this.estimateFileDuration(audioFile.size);
    const isUltraLong = estimatedDuration > 3600; // Over 1 hour
    
    const logContext: LogContext = {
      requestId,
      provider: settings.stt.provider,
      model: settings.stt.model,
      filePath: audioFile.name,
      durationSec: estimatedDuration,
      sizeBytes: audioFile.size
    };

    try {
      // Dynamic segment options based on audio length
      const segmentOptions: SegmentOptions = this.getOptimalSegmentOptions(settings, estimatedDuration);
      
      await logger.log('info', {
        ...logContext,
        message: `Processing ${isUltraLong ? 'ultra-long' : 'standard'} audio file`,
        processingMode: isUltraLong ? 'hierarchical' : 'standard',
        estimatedChunks: Math.ceil(estimatedDuration / (segmentOptions.maxChunkDurationSec || 150))
      });

      console.log('🔍 SEGMENTATION: About to call segmenter.segmentAudio with options:', {
        maxUploadSizeMB: segmentOptions.maxUploadSizeMB,
        maxChunkDurationSec: segmentOptions.maxChunkDurationSec,
        enablePreprocessing: segmentOptions.enablePreprocessing,
        audioCodec: segmentOptions.audioCodec
      });
      
      const segments = await segmenter.segmentAudio(audioFile, segmentOptions);
      
      console.log('🔍 SEGMENTATION: segmentAudio returned:', {
        segmentCount: segments.length,
        totalSize: segments.reduce((sum, seg) => sum + seg.sizeBytes, 0),
        segmentSizes: segments.map(seg => `${(seg.sizeBytes / 1024 / 1024).toFixed(1)}MB`).join(', ')
      });
      
      if (segments.length === 0) {
        console.error('🚨 SEGMENTATION FAILED: No segments returned from AudioSegmenter');
        console.error('🚨 This is likely why transcription is failing');
        console.error('🚨 Check FFmpeg availability and audio file format');
      }
      
      // Validate segments have consistent timeline
      this.validateSegmentTimeline(segments);
      
      await logger.log('info', {
        ...logContext,
        message: `Segmented audio into ${segments.length} chunks`,
        chunkCount: segments.length
      });
      
      // Debug segment details
      console.log(`🔍 Segmentation details:`);
      segments.forEach((seg, index) => {
        const duration = seg.endSec - seg.startSec;
        console.log(`  Segment ${index}: ${seg.startSec.toFixed(1)}s-${seg.endSec.toFixed(1)}s (${duration.toFixed(1)}s), ${(seg.sizeBytes / 1024).toFixed(1)}KB`);
      });

      // Process segments with batch parallel processing
      console.log(`🔍 About to process ${segments.length} segments with batch processing`);
      const chunkResults: VerboseTranscriptionResult[] = await this.processSegmentsBatch(
        segments, audioFile, settings, logContext, logger
      );
      
      console.log(`🔍 Batch processing completed. Got ${chunkResults.length} results`);
      chunkResults.forEach((result, index) => {
        console.log(`  Result ${index}: text=${result.text?.length || 0}chars, segments=${result.segments?.length || 0}`);
      });

      // Merge results with timeline correction
      let mergedResult = this.mergeVerboseResults(chunkResults, segments);
      
      // Apply speaker diarization to the complete merged result if enabled
      if (this.diarizationService) {
        try {
          mergedResult = await this.diarizationService.enhanceTranscriptionWithSpeakers(mergedResult, audioFile);
          
          await logger.log('info', {
            ...logContext,
            message: 'Applied speaker diarization to merged result',
            speakerCount: mergedResult.speakers?.length || 0
          });
        } catch (error) {
          console.warn('🎤 Speaker diarization failed, continuing without it:', error);
          await logger.log('warn', {
            ...logContext,
            message: 'Speaker diarization failed, continuing without speaker information'
          });
        }
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
    // Filter out empty results and log them
    const validResults = chunkResults.filter((result, index) => {
      const hasContent = result.text && result.text.trim();
      if (!hasContent) {
        console.log(`Chunk ${index + 1} has no content, skipping from merge`);
      }
      return hasContent;
    });
    
    if (validResults.length === 0) {
      console.warn('All chunks are empty, returning empty result');
      return {
        text: '',
        language: chunkResults[0]?.language || 'ko',
        duration: segments[segments.length - 1]?.endSec || 0,
        segments: [],
        raw: { chunks: [] }
      };
    }
    
    console.log(`Merging ${validResults.length}/${chunkResults.length} valid chunks`);
    
    const combinedText = validResults.map(result => result.text).join(' ');
    const combinedSegments = [];
    const rawChunks = [];
    
    let segmentId = 0;
    for (let i = 0; i < chunkResults.length; i++) {
      const chunkResult = chunkResults[i];
      const segmentOffset = segments[i].startSec;
      
      // Skip empty chunks
      if (!chunkResult.text || !chunkResult.text.trim()) {
        continue;
      }
      
      // Collect raw data
      if (chunkResult.raw) {
        rawChunks.push(chunkResult.raw);
      }
      
      // Merge segments with timeline offset
      if (chunkResult.segments) {
        for (const segment of chunkResult.segments) {
          if (segment.text && segment.text.trim()) {
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
    }

    console.log(`Merge result: ${combinedText.length} chars, ${combinedSegments.length} segments`);
    
    // Debug empty result
    if (!combinedText || combinedText.trim() === '') {
      console.error('🚨 MERGE DEBUG: All chunks resulted in empty text!');
      console.error('🚨 Chunk details:');
      chunkResults.forEach((chunk, index) => {
        console.error(`  Chunk ${index}: hasText=${!!chunk.text}, length=${chunk.text?.length || 0}, segments=${chunk.segments?.length || 0}`);
        if (chunk.segments && chunk.segments.length > 0) {
          console.error(`    First segment: "${chunk.segments[0].text?.substring(0, 50) || 'empty'}"`);
        }
      });
    }

    const result = {
      text: combinedText,
      language: chunkResults[0]?.language,
      duration: segments[segments.length - 1]?.endSec || 0,
      segments: combinedSegments,
      raw: { chunks: rawChunks }
    };
    
    console.log(`🔍 Final merge result: text=${result.text.length}chars, segments=${result.segments.length}, duration=${result.duration}s`);
    return result;
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
    try {
      let buffer: Buffer;
      let actualSize: number;
      
      if (Buffer.isBuffer(segment.bufferOrPath)) {
        buffer = segment.bufferOrPath;
        actualSize = buffer.length;
      } else {
        // For file path, read the file
        const fs = require('fs');
        buffer = fs.readFileSync(segment.bufferOrPath);
        actualSize = buffer.length;
      }
      
      console.log(`🔍 Creating segment file: ${filename}`);
      console.log(`  Expected size: ${(segment.sizeBytes / 1024).toFixed(1)}KB, Actual size: ${(actualSize / 1024).toFixed(1)}KB`);
      console.log(`  Duration: ${(segment.endSec - segment.startSec).toFixed(1)}s`);
      
      // Validate segment has content
      if (actualSize === 0) {
        throw new Error(`Segment file is empty: ${filename}`);
      }
      
      if (actualSize < 1000) {
        console.warn(`🚨 Very small segment: ${filename} (${actualSize} bytes) - may not contain audio`);
      }
      
      return new File([buffer], filename, { type: 'audio/m4a' });
    } catch (error) {
      console.error(`🚨 Failed to create segment file ${filename}:`, error);
      throw error;
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

  private async processSegmentsBatch(
    segments: SegmentResult[], 
    audioFile: File,
    settings: ATTNSettings, 
    logContext: LogContext, 
    logger: Logger
  ): Promise<VerboseTranscriptionResult[]> {
    const batchSize = this.getBatchSize(segments.length);
    const results: VerboseTranscriptionResult[] = [];
    
    await logger.log('info', {
      ...logContext,
      message: `Starting batch processing with batch size: ${batchSize}`,
      totalSegments: segments.length,
      estimatedBatches: Math.ceil(segments.length / batchSize)
    });

    // Process segments in batches
    for (let batchIndex = 0; batchIndex < segments.length; batchIndex += batchSize) {
      const batch = segments.slice(batchIndex, batchIndex + batchSize);
      const batchNumber = Math.floor(batchIndex / batchSize) + 1;
      const totalBatches = Math.ceil(segments.length / batchSize);
      
      await logger.log('info', {
        ...logContext,
        message: `Processing batch ${batchNumber}/${totalBatches} (${batch.length} segments)`,
        batchIndex: batchNumber
      });

      // Process batch concurrently with Promise.allSettled for error resilience
      const batchPromises = batch.map(async (segment, segmentIndex) => {
        const globalIndex = batchIndex + segmentIndex;
        const chunkLogContext = {
          ...logContext,
          chunkIndex: globalIndex,
          chunkCount: segments.length,
          batchIndex: batchNumber,
          durationSec: segment.endSec - segment.startSec,
          sizeBytes: segment.sizeBytes
        };

        try {
          // Convert segment to File object for API
          const chunkFile = await this.segmentToFile(segment, `${audioFile.name}_chunk_${globalIndex}`);
          
          // Transcribe chunk with retry logic
          const result = await this.transcribeChunkWithRetry(chunkFile, settings, chunkLogContext, logger);
          
          // Validate transcription result
          if (!result.text || result.text.trim() === '') {
            console.warn(`🔍 CHUNK ${globalIndex + 1}: Empty transcription detected`);
            console.warn(`  Duration: ${(segment.endSec - segment.startSec).toFixed(1)}s`);
            console.warn(`  Size: ${(segment.sizeBytes / 1024).toFixed(1)}KB`);
            console.warn(`  Segments count: ${result.segments?.length || 0}`);
            
            // Try to recover from segments
            if (result.segments && result.segments.length > 0) {
              const recoveredText = result.segments.map(seg => seg.text || '').filter(t => t.trim()).join(' ').trim();
              if (recoveredText) {
                result.text = recoveredText;
                console.log(`🚑 CHUNK ${globalIndex + 1}: Recovered ${recoveredText.length} chars from segments: "${recoveredText.substring(0, 100)}..."`);
              } else {
                console.warn(`🚑 CHUNK ${globalIndex + 1}: Segments exist but all are empty`);
                result.segments.forEach((seg, segIndex) => {
                  console.warn(`    Segment ${segIndex}: "${seg.text}" (${seg.start}-${seg.end}s)`);
                });
              }
            }
            
            // Still empty after recovery attempt
            if (!result.text || result.text.trim() === '') {
              console.warn(`🚨 CHUNK ${globalIndex + 1}: No recoverable content found - this chunk may be silent or corrupted`);
              // Create minimal result to avoid breaking the pipeline
              result.text = '';
              result.segments = [];
            }
          } else {
            console.log(`✓ CHUNK ${globalIndex + 1}: Successfully transcribed ${result.text.length} characters`);
          }
          
          await logger.log('info', {
            ...chunkLogContext,
            message: `Successfully transcribed chunk ${globalIndex + 1}/${segments.length} (${result.text.length} chars)`
          });
          
          return { success: true as const, result, index: globalIndex };
        } catch (error) {
          await logger.logError(chunkLogContext, error);
          return { 
            success: false as const, 
            error: error as Error, 
            index: globalIndex,
            segment 
          };
        }
      });

      // Wait for batch completion
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results and handle failures
      const successfulResults: Array<{ result: VerboseTranscriptionResult, index: number }> = [];
      const failedResults: Array<{ error: Error, index: number, segment: SegmentResult }> = [];
      
      for (const settledResult of batchResults) {
        if (settledResult.status === 'fulfilled') {
          const batchItem = settledResult.value;
          if (batchItem.success) {
            successfulResults.push({ result: batchItem.result, index: batchItem.index });
          } else {
            failedResults.push({ 
              error: batchItem.error, 
              index: batchItem.index, 
              segment: batchItem.segment 
            });
          }
        } else {
          // Promise itself was rejected
          const errorContext = {
            ...logContext,
            batchIndex: batchNumber
          };
          await logger.log('error', errorContext);
        }
      }

      // Handle failed segments with retry
      if (failedResults.length > 0) {
        await logger.log('warn', {
          ...logContext,
          message: `Retrying ${failedResults.length} failed segments from batch ${batchNumber}`,
          failedCount: failedResults.length
        });

        // Retry failed segments sequentially with delay
        for (const failed of failedResults) {
          try {
            await this.sleep(1000); // 1 second delay between retries
            
            const chunkFile = await this.segmentToFile(failed.segment, `${audioFile.name}_chunk_${failed.index}_retry`);
            const retryResult = await this.transcribeChunkWithRetry(
              chunkFile, 
              settings, 
              { ...logContext, chunkIndex: failed.index }, 
              logger
            );
            
            successfulResults.push({ result: retryResult, index: failed.index });
            
            const retrySuccessContext = {
              ...logContext,
              chunkIndex: failed.index
            };
            await logger.log('info', retrySuccessContext);
          } catch (retryError) {
            const failureContext = {
              ...logContext,
              chunkIndex: failed.index
            };
            await logger.logError(failureContext, retryError);
            
            throw new Error(`Failed to transcribe chunk ${failed.index} after retry: ${(retryError as Error).message}`);
          }
        }
      }

      // Sort results by index to maintain order
      successfulResults.sort((a, b) => a.index - b.index);
      results.push(...successfulResults.map(item => item.result));
      
      await logger.log('info', {
        ...logContext,
        message: `Completed batch ${batchNumber}/${totalBatches}`,
        processedSegments: results.length,
        remainingSegments: segments.length - results.length
      });

      // Rate limiting delay between batches (except for last batch)
      if (batchIndex + batchSize < segments.length) {
        const delayMs = this.getBatchDelay(batchSize);
        await logger.log('info', {
          ...logContext,
          message: `Rate limiting delay: ${delayMs}ms before next batch`
        });
        await this.sleep(delayMs);
      }
    }

    await logger.log('info', {
      ...logContext,
      message: `Batch processing completed. Processed ${results.length}/${segments.length} segments`,
      successRate: ((results.length / segments.length) * 100).toFixed(1) + '%'
    });

    return results;
  }

  private getBatchSize(totalSegments: number): number {
    // Dynamic batch sizing based on total segments
    if (totalSegments > 100) {
      return 15; // Large files: smaller batches for stability
    } else if (totalSegments > 50) {
      return 12; // Medium files
    } else {
      return 10; // Small files: larger batches for speed
    }
  }

  private getBatchDelay(batchSize: number): number {
    // Progressive delay based on batch size to respect rate limits
    return Math.max(1000, batchSize * 200); // Minimum 1 second, increase with batch size
  }

  private estimateFileDuration(sizeBytes: number): number {
    // Rough estimate: ~1MB per minute for compressed audio
    return (sizeBytes / (1024 * 1024)) * 60;
  }

  private getOptimalSegmentOptions(settings: ATTNSettings, estimatedDuration: number): SegmentOptions {
    // Optimize settings based on audio duration
    const isUltraLong = estimatedDuration > 3600; // Over 1 hour
    
    if (isUltraLong) {
      // Ultra-long meeting optimizations
      return {
        maxUploadSizeMB: settings.processing.maxUploadSizeMB || 24.5,
        maxChunkDurationSec: 150, // Increased from 85 to reduce chunk count
        targetSampleRateHz: 16000, // Optimized for faster processing
        targetChannels: 1, // Mono for efficiency
        silenceThresholdDb: -30, // Enhanced silence detection
        minSilenceMs: 300, // Faster segmentation
        hardSplitWindowSec: 120, // Longer hard splits
        preserveIntermediates: settings.processing.preserveIntermediates || false,
        contextOverlapSec: 2, // Minimal overlap for continuity
        enablePreprocessing: true,
        audioCodec: 'aac',
        audioBitrate: '96k' // Lower bitrate for faster processing
      };
    } else {
      // Standard meeting settings
      return {
        maxUploadSizeMB: settings.processing.maxUploadSizeMB,
        maxChunkDurationSec: settings.processing.maxChunkDurationSec,
        targetSampleRateHz: settings.processing.targetSampleRateHz,
        targetChannels: settings.processing.targetChannels,
        silenceThresholdDb: settings.processing.silenceThresholdDb,
        minSilenceMs: settings.processing.minSilenceMs,
        hardSplitWindowSec: settings.processing.hardSplitWindowSec,
        preserveIntermediates: settings.processing.preserveIntermediates,
        contextOverlapSec: settings.processing.contextOverlapSec,
        enablePreprocessing: true,
        audioCodec: 'aac',
        audioBitrate: '128k'
      };
    }
  }
}