import { ConfigLoader } from './configLoader';
import { createSttProvider } from './providers/providerFactory';
import { ErrorSanitizer } from './utils/errorSanitizer';
import { AudioValidator } from './utils/audioValidator';
import { TranscriptFormatter } from './services/transcriptFormatter';
import { SummarizationService } from './services/summarizationService';
import {
  ATTNSettings,
  VerboseTranscriptionResult,
  PerformanceMetrics,
  ProcessingProgress,
  ProgressCallback,
  StreamingCallback,
  StreamingResult
} from './types';
import {
  FILE_SIZE_LIMITS,
  estimateFileDuration
} from './constants';

export interface ProcessAudioResult {
  transcript: string;
  summary: string;
  transcriptionResult: VerboseTranscriptionResult; // Detailed transcription data
  performanceMetrics?: PerformanceMetrics;
  processingTimeMs: number;
}

export class ApiService {
  private config: ConfigLoader;
  private settings: ATTNSettings;
  private performanceMetrics: PerformanceMetrics;
  private progressCallback?: ProgressCallback;
  private streamingCallback?: StreamingCallback;
  private processingStartTime: number = 0;

  constructor(settings: ATTNSettings) {
    this.config = ConfigLoader.getInstance();
    this.settings = settings;
    this.initializePerformanceMetrics();

    if (this.config.isDebugMode()) {
      console.log('🔧 ATTN Debug: ApiService initialized with new provider system');
    }
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  setStreamingCallback(callback: StreamingCallback): void {
    this.streamingCallback = callback;
  }

  private initializePerformanceMetrics(): void {
    this.performanceMetrics = {
      totalProcessingTime: 0,
      segmentationTime: 0,
      transcriptionTime: 0,
      summarizationTime: 0,
      silenceDetectionTime: 0,
      cacheHitRate: 0,
      parallelBatches: 0,
      averageBatchSize: 0,
      errorRate: 0
    };
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  async processAudioFile(audioFile: File, systemPrompt?: string): Promise<ProcessAudioResult> {
    this.processingStartTime = Date.now();
    this.initializePerformanceMetrics();
    
    try {
      // Validate audio file before processing
      const validationResult = AudioValidator.validate(audioFile);
      if (!validationResult.isValid) {
        throw new Error(`오디오 파일 검증 실패: ${validationResult.error}`);
      }

      // Log warnings if any
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        validationResult.warnings.forEach(warning => console.warn(warning));
      }

      // Emit initial progress
      this.emitProgress({
        stage: 'segmentation',
        progress: 0,
        currentStep: 'Initializing audio processing',
        completedSteps: 0,
        totalSteps: 3
      });

      // Determine processing strategy based on file size
      const fileSizeAnalysis = this.analyzeFileSize(audioFile);
      const estimatedDuration = estimateFileDuration(audioFile.size);
      
      console.log(`Processing audio: ${audioFile.name}, size: ${fileSizeAnalysis.sizeMB}MB, estimated: ${Math.round(estimatedDuration / 60)}min`);
      console.log(`🔍 Processing strategy: ${fileSizeAnalysis.shouldUseChunking ? 'CHUNKING' : 'DIRECT'} (${fileSizeAnalysis.reason})`);
      
      let verboseResult: VerboseTranscriptionResult;
      
      if (fileSizeAnalysis.shouldUseChunking) {
        if (!this.settings.processing?.enableChunking) {
          console.warn('⚠️ File exceeds size limit but chunking is disabled! This will likely fail.');
          console.warn('⚠️ Attempting direct transcription anyway...');
        }
        
        // Use chunking workflow: transcribe all chunks first, then process complete result
        this.emitProgress({
          stage: 'transcription',
          progress: 10,
          currentStep: `Processing large file (${fileSizeAnalysis.sizeMB}MB, ~${Math.round(estimatedDuration / 60)}min) with chunking`,
          completedSteps: 0,
          totalSteps: Math.ceil(estimatedDuration / 150) + 2 // Estimated chunks + summarization
        });
        verboseResult = await this.processWithChunking(audioFile);
      } else {
        // Direct transcription for smaller files
        this.emitProgress({
          stage: 'transcription',
          progress: 10,
          currentStep: 'Direct transcription for standard file',
          completedSteps: 0,
          totalSteps: 2
        });
        
        // Direct transcription is used automatically for smaller files
        verboseResult = await this.transcribeAudioVerbose(audioFile);
      }
      
      if (!verboseResult.text || verboseResult.text.trim() === '') {
        console.error('🚨 FINAL RESULT DEBUG: Empty transcription result');
        console.error('Result details:', {
          hasText: !!verboseResult.text,
          textLength: verboseResult.text?.length || 0,
          segmentCount: verboseResult.segments?.length || 0,
          firstSegment: verboseResult.segments?.[0]?.text?.substring(0, 100) || 'N/A',
          audioFileSize: audioFile.size,
          audioFileName: audioFile.name,
          processingMode: fileSizeAnalysis.shouldUseChunking ? 'chunked' : 'direct',
          duration: verboseResult.duration,
          language: verboseResult.language
        });
        
        // Advanced recovery attempt
        if (verboseResult.segments && verboseResult.segments.length > 0) {
          console.log('🔍 Attempting advanced text recovery from segments...');
          
          const nonEmptySegments = verboseResult.segments.filter(seg => seg.text && seg.text.trim());
          console.log(`Found ${nonEmptySegments.length}/${verboseResult.segments.length} non-empty segments`);
          
          if (nonEmptySegments.length > 0) {
            const recoveredText = nonEmptySegments.map(seg => seg.text.trim()).join(' ').trim();
            if (recoveredText) {
              console.log('🚑 Successfully recovered text from segments:', recoveredText.substring(0, 200) + '...');
              verboseResult.text = recoveredText;
            } else {
              console.error('🚨 All segments are empty after filtering');
              this.logSegmentDetails(verboseResult.segments);
              throw new Error(`음성 인식 결과가 비어있습니다. 파일: ${audioFile.name} (${(audioFile.size/1024/1024).toFixed(2)}MB)\n\n가능한 원인:\n- 오디오 파일이 손상되었을 수 있습니다\n- 음성이 너무 작거나 노이즈가 많을 수 있습니다\n- 3배속 처리로 인해 음성이 자연스럽지 않을 수 있습니다`);
            }
          } else {
            console.error('🚨 No valid segments found for recovery');
            this.logSegmentDetails(verboseResult.segments);
            throw new Error(`음성 인식에 실패했습니다. ${verboseResult.segments.length}개의 구간으로 나눠졌으나 모두 비어있습니다.\n\n해결 방안:\n1. 원본 오디오 파일을 확인해주세요\n2. 1배속으로 다시 시도해주세요\n3. 다른 오디오 파일로 테스트해주세요`);
          }
        } else {
          console.error('🚨 No segments found in transcription result');
          throw new Error(`음성 인식에 실패했습니다. 세그먼트가 생성되지 않았습니다.\n\n해결 방안:\n1. 오디오 파일이 손상되지 않았는지 확인\n2. 오디오 형식이 지원되는지 확인 (M4A, MP3, WAV 권장)\n3. 파일 크기가 너무 큰지 확인`);
        }
      }

      // Update transcription completion
      this.performanceMetrics.transcriptionTime = Date.now() - this.processingStartTime - this.performanceMetrics.segmentationTime;
      
      this.emitProgress({
        stage: 'summarization',
        progress: 70,
        currentStep: 'Generating meeting summary',
        completedSteps: verboseResult.segments.length,
        totalSteps: verboseResult.segments.length + 1,
        performanceMetrics: this.performanceMetrics
      });

      // Step 2: Summarize the complete transcription result (allow fallback to raw text)
      const summaryStartTime = Date.now();
      let summary: string;

      try {
        const summarizationService = new SummarizationService(this.settings);
        summary = await summarizationService.summarize(verboseResult, systemPrompt);
        this.performanceMetrics.summarizationTime = Date.now() - summaryStartTime;
        
        if (!summary || summary.trim() === '') {
          throw new Error('요약 결과가 비어있습니다.');
        }
      } catch (summaryError) {
        console.warn('⚠️ 요약 생성에 실패했지만 STT 원문을 제공합니다:', summaryError.message);

        // Provide structured transcription as fallback summary
        const structuredTranscript = TranscriptFormatter.formatWithTimestamps(verboseResult);
        
        summary = `# 음성 인식 원문 (요약 실패)\n\n**⚠️ 토큰 제한으로 인해 요약을 생성하지 못했습니다. 아래는 시간대별 음성 인식 원문입니다.**\n\n${structuredTranscript}\n\n---\n\n**📊 파일 정보**\n- 🎵 음성 길이: ${Math.round((verboseResult.duration || 0) / 60)}분 ${Math.round((verboseResult.duration || 0) % 60)}초\n- 📝 세그먼트 수: ${verboseResult.segments?.length || 0}개\n- 📁 총 텍스트 길이: ${verboseResult.text.length.toLocaleString()}자\n\n**❌ 오류 원인:** ${summaryError.message.includes('token') ? '토큰 제한 초과 (텍스트가 너무 길어 요약 불가)' : summaryError.message}`;
        
        this.performanceMetrics.summarizationTime = Date.now() - summaryStartTime;
        console.log('📝 STT 원문으로 대체된 결과를 제공합니다.');
      }

      // Final metrics
      this.performanceMetrics.totalProcessingTime = Date.now() - this.processingStartTime;
      
      this.emitProgress({
        stage: 'complete',
        progress: 100,
        currentStep: 'Processing completed successfully',
        completedSteps: verboseResult.segments.length + 1,
        totalSteps: verboseResult.segments.length + 1,
        performanceMetrics: this.performanceMetrics
      });

      // Emit final streaming result
      if (this.streamingCallback) {
        this.streamingCallback({
          partialTranscript: verboseResult.text,
          partialSummary: summary,
          progress: {
            stage: 'complete',
            progress: 100,
            currentStep: 'Processing completed',
            completedSteps: verboseResult.segments.length + 1,
            totalSteps: verboseResult.segments.length + 1,
            performanceMetrics: this.performanceMetrics
          },
          intermediateResults: verboseResult.segments.map((segment, index) => ({
            segmentIndex: index,
            transcription: segment.text,
            timestamp: { start: segment.start, end: segment.end }
          }))
        });
      }

      return {
        transcript: verboseResult.text,
        summary: summary,
        transcriptionResult: verboseResult,
        performanceMetrics: this.performanceMetrics,
        processingTimeMs: this.performanceMetrics.totalProcessingTime
      };
    } catch (error) {
      // Emit error progress
      this.emitProgress({
        stage: 'complete',
        progress: 0,
        currentStep: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        completedSteps: 0,
        totalSteps: 1
      });
      
      if (error instanceof Error) {
        // Re-throw our custom errors as-is
        if (error.message.includes('음성 인식') || error.message.includes('요약') || error.message.includes('비어있습니다')) {
          throw error;
        }
        
        // For other errors, categorize them
        if (error.message.toLowerCase().includes('whisper') || error.message.toLowerCase().includes('transcription')) {
          throw new Error(`음성 인식 실패: ${error.message}`);
        } else {
          throw new Error(`요약 생성 실패: ${error.message}`);
        }
      }
      throw error;
    }
  }

  private emitProgress(progress: ProcessingProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
    
    if (this.config.isDebugMode()) {
      console.log(`🔧 ATTN Progress: ${progress.stage} - ${progress.currentStep} (${progress.progress}%)`);
    }
  }

  private analyzeFileSize(audioFile: File): {
    sizeMB: string;
    sizeBytes: number;
    shouldUseChunking: boolean;
    reason: string;
  } {
    const sizeBytes = audioFile.size;
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
    const configuredLimitMB = this.settings.processing?.maxUploadSizeMB || FILE_SIZE_LIMITS.CONSERVATIVE_LIMIT_MB;
    const effectiveLimitMB = Math.min(configuredLimitMB, FILE_SIZE_LIMITS.CONSERVATIVE_LIMIT_MB);
    const effectiveLimitBytes = effectiveLimitMB * 1024 * 1024;
    
    let shouldUseChunking = false;
    let reason = '';
    
    if (sizeBytes > effectiveLimitBytes) {
      shouldUseChunking = true;
      reason = `File size (${sizeMB}MB) exceeds limit (${effectiveLimitMB}MB)`;
    } else if (!this.settings.processing?.enableChunking) {
      shouldUseChunking = false;
      reason = 'File within limits, chunking disabled';
    } else {
      shouldUseChunking = false;
      reason = `File within limits (${sizeMB}MB <= ${effectiveLimitMB}MB)`;
    }
    
    return {
      sizeMB,
      sizeBytes,
      shouldUseChunking,
      reason
    };
  }

  private logSegmentDetails(segments: any[]): void {
    console.error('Segment details:');
    segments.slice(0, 10).forEach((seg, index) => { // Show first 10 segments
      console.error(`  Segment ${index}: "${seg.text || 'EMPTY'}" (${seg.start}-${seg.end}s)`);
    });
    if (segments.length > 10) {
      console.error(`  ... and ${segments.length - 10} more segments`);
    }
  }

  async transcribeAudio(audioFile: File, options: { format: 'verbose_json' }): Promise<VerboseTranscriptionResult> {
    return this.transcribeAudioVerbose(audioFile);
  }

  private async processWithChunking(audioFile: File): Promise<VerboseTranscriptionResult> {
    console.log('🔍 CHUNKING WORKFLOW: Starting processWithChunking for file:', {
      name: audioFile.name,
      size: `${(audioFile.size / 1024 / 1024).toFixed(2)}MB`,
      type: audioFile.type,
      enableChunking: this.settings.processing?.enableChunking
    });
    
    try {
      const { AudioProcessor } = await import('./audioProcessor');
      const audioProcessor = new AudioProcessor();
      
      console.log('🔍 CHUNKING WORKFLOW: AudioProcessor created, calling transcribeWithChunking...');
      console.log('🔍 CHUNKING WORKFLOW: Settings passed to AudioProcessor:', {
        sttProvider: this.settings.stt?.provider,
        sttModel: this.settings.stt?.model,
        hasApiKey: !!this.settings.stt?.apiKey,
        chunkingEnabled: this.settings.processing?.enableChunking,
        maxUploadSizeMB: this.settings.processing?.maxUploadSizeMB
      });

      // Step 1: Transcribe all chunks (STT only, no summarization)
      const chunkTranscriptionResult = await audioProcessor.transcribeWithChunking(audioFile, this.settings);
      
      console.log('🔍 CHUNKING WORKFLOW: transcribeWithChunking completed', {
        hasText: !!chunkTranscriptionResult.text,
        textLength: chunkTranscriptionResult.text?.length || 0,
        segmentCount: chunkTranscriptionResult.segments?.length || 0,
        previewText: chunkTranscriptionResult.text?.substring(0, 100) || 'No text',
        hasSegments: !!chunkTranscriptionResult.segments,
        segmentDetails: chunkTranscriptionResult.segments?.slice(0, 3).map(seg => ({
          start: seg.start,
          end: seg.end,
          textLength: seg.text?.length || 0,
          hasText: !!seg.text
        })) || 'No segments'
      });

      // If we got empty results, let's investigate why
      if (!chunkTranscriptionResult.text && (!chunkTranscriptionResult.segments || chunkTranscriptionResult.segments.length === 0)) {
        console.error('🚨 CHUNKING WORKFLOW FAILED: Empty result from transcribeWithChunking');
        console.error('🚨 This suggests the chunking process itself failed');
        console.error('🚨 Check audioProcessor.transcribeWithChunking implementation');
      }

      return chunkTranscriptionResult;
    } catch (error) {
      console.error('🚨 CHUNKING WORKFLOW ERROR:', error);
      console.error('🚨 Error occurred in processWithChunking:', error.stack);
      throw error;
    }
  }

  private async transcribeAudioVerbose(audioFile: File): Promise<VerboseTranscriptionResult> {
    try {
      // Get effective STT settings (priority: settings.stt.apiKey > legacy openaiApiKey > config file)
      const effectiveSttSettings = {
        ...this.settings.stt,
        apiKey: this.settings.stt.apiKey || this.settings.openaiApiKey || this.config.getOpenAIApiKey() || '',
        language: this.settings.stt.language || this.config.getOpenAISettings()?.language || 'ko'
      };

      if (!effectiveSttSettings.apiKey && effectiveSttSettings.provider === 'openai') {
        throw new Error('STT API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.');
      }

      // Get timeout from settings
      const timeout = this.settings.processing?.apiTimeoutMs;
      const sttProvider = createSttProvider(
        effectiveSttSettings,
        timeout,
        this.settings._mlxBridgeScriptPath
      );
      
      console.log('🔍 DIRECT STT: About to read arrayBuffer from audioFile:', {
        fileName: audioFile.name,
        fileSize: audioFile.size,
        fileType: audioFile.type
      });
      
      const audioBuffer = await audioFile.arrayBuffer();
      
      console.log('🔍 DIRECT STT: ArrayBuffer read successfully:', {
        bufferSize: audioBuffer.byteLength,
        sizeMatchesFile: audioBuffer.byteLength === audioFile.size
      });
      
      const result = await sttProvider.transcribe(audioBuffer, {
        format: 'verbose_json',
        language: effectiveSttSettings.language,
        model: effectiveSttSettings.model
      });

      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Transcription completed using ${effectiveSttSettings.provider}/${effectiveSttSettings.model}`);
        console.log(`🔧 ATTN Debug: Segments found: ${result.segments.length}`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`음성 인식 실패: ${error.message}`);
      }
      throw error;
    }
  }

  private estimateAudioDuration(verboseResult: VerboseTranscriptionResult): number {
    if (!verboseResult.segments || verboseResult.segments.length === 0) {
      return 0;
    }

    // Find the last segment's end time
    const lastSegment = verboseResult.segments[verboseResult.segments.length - 1];
    return lastSegment.end || 0;
  }
}