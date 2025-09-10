import { ConfigLoader } from './configLoader';
import { createSttProvider, createSummarizationProvider } from './providers/providerFactory';
import { 
  ATTNSettings, 
  VerboseTranscriptionResult, 
  PerformanceMetrics, 
  ProcessingProgress, 
  ProgressCallback,
  StreamingCallback,
  StreamingResult
} from './types';

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
      // Emit initial progress
      this.emitProgress({
        stage: 'segmentation',
        progress: 0,
        currentStep: 'Initializing audio processing',
        completedSteps: 0,
        totalSteps: 3
      });

      // Check if file is large enough to require chunking
      const maxSizeMB = this.settings.processing?.maxUploadSizeMB || 24.5;
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      const estimatedDuration = this.estimateFileDuration(audioFile.size);
      
      let verboseResult: VerboseTranscriptionResult;
      
      if (audioFile.size > maxSizeBytes && this.settings.processing?.enableChunking) {
        // Use chunking workflow: transcribe all chunks first, then process complete result
        this.emitProgress({
          stage: 'transcription',
          progress: 10,
          currentStep: `Processing large file (${(audioFile.size / 1024 / 1024).toFixed(1)}MB, ~${Math.round(estimatedDuration / 60)}min)`,
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
        
        verboseResult = await this.transcribeAudioVerbose(audioFile);
      }
      
      if (!verboseResult.text || verboseResult.text.trim() === '') {
        throw new Error('음성 인식 결과가 비어있습니다.');
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

      // Step 2: Summarize the complete transcription result
      const summaryStartTime = Date.now();
      const summary = await this.summarizeWithSegments(verboseResult, systemPrompt);
      this.performanceMetrics.summarizationTime = Date.now() - summaryStartTime;
      
      if (!summary || summary.trim() === '') {
        throw new Error('요약 결과가 비어있습니다.');
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

  private estimateFileDuration(sizeBytes: number): number {
    // Rough estimate: ~1MB per minute for compressed audio
    return (sizeBytes / (1024 * 1024)) * 60;
  }

  async transcribeAudio(audioFile: File, options: { format: 'verbose_json' }): Promise<VerboseTranscriptionResult> {
    return this.transcribeAudioVerbose(audioFile);
  }

  private async processWithChunking(audioFile: File): Promise<VerboseTranscriptionResult> {
    const { AudioProcessor } = await import('./audioProcessor');
    const audioProcessor = new AudioProcessor();
    
    if (this.config.isDebugMode()) {
      console.log('🔧 ATTN Debug: Starting chunked transcription workflow');
    }

    // Step 1: Transcribe all chunks (STT only, no summarization)
    const chunkTranscriptionResult = await audioProcessor.transcribeWithChunking(audioFile, this.settings);
    
    if (this.config.isDebugMode()) {
      console.log(`🔧 ATTN Debug: Completed transcription of ${chunkTranscriptionResult.segments.length} segments`);
    }

    return chunkTranscriptionResult;
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

      const sttProvider = createSttProvider(effectiveSttSettings);
      const audioBuffer = await audioFile.arrayBuffer();
      
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

  private async summarizeWithSegments(verboseResult: VerboseTranscriptionResult, customSystemPrompt?: string): Promise<string> {
    try {
      const estimatedDuration = verboseResult.duration || this.estimateAudioDuration(verboseResult);
      const isUltraLong = estimatedDuration > 3600; // Over 1 hour
      
      if (isUltraLong && verboseResult.segments.length > 50) {
        // Use hierarchical summarization for ultra-long meetings
        if (this.config.isDebugMode()) {
          console.log(`🔧 ATTN Debug: Using hierarchical summarization for ${Math.round(estimatedDuration / 60)}-minute meeting`);
        }
        
        return await this.hierarchicalSummarization(verboseResult, customSystemPrompt);
      } else {
        // Use standard summarization for shorter meetings
        return await this.standardSummarization(verboseResult, customSystemPrompt);
      }
    } catch (error) {
      if (error instanceof Error) {
        // Enhanced error reporting for better debugging
      const errorMessage = (error as any).response?.data?.error?.message || (error as Error).message;
      const errorCode = (error as any).response?.status || 'unknown';
      const errorType = (error as any).response?.data?.error?.type || 'unknown';
      
      console.error('Summarization error details:', {
        message: errorMessage,
        code: errorCode,
        type: errorType,
        provider: this.settings.summary.provider,
        model: this.settings.summary.model
      });
      
      throw new Error(`요약 생성 실패 (${errorCode}): ${errorMessage}`);
      }
      throw error;
    }
  }

  private async standardSummarization(verboseResult: VerboseTranscriptionResult, customSystemPrompt?: string): Promise<string> {
    // Get effective Summary settings
    const effectiveSummarySettings = {
      ...this.settings.summary,
      apiKey: this.settings.summary.apiKey || this.settings.openaiApiKey || this.config.getOpenAIApiKey() || ''
    };

    if (!effectiveSummarySettings.apiKey && effectiveSummarySettings.provider === 'openai') {
      throw new Error('Summary API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.');
    }

    const summaryProvider = createSummarizationProvider(effectiveSummarySettings);
    
    // Use custom system prompt if provided, otherwise use settings
    const systemPrompt = customSystemPrompt || this.settings.systemPrompt;

    // Enhanced context information for better meeting summarization
    const estimatedDuration = verboseResult.duration || this.estimateAudioDuration(verboseResult);
    const speakerInfo = verboseResult.speakers ? 
      `참석자: ${verboseResult.speakers.length}명` : 
      '참석자: 화자 분리 정보 없음';
    
    const meetingContext = `
이것은 약 ${Math.round(estimatedDuration / 60)}분간의 회의 내용입니다.
${speakerInfo}
총 ${verboseResult.segments.length}개의 발언 구간으로 구성되어 있습니다.

회의의 전체적인 흐름과 맥락을 고려하여 일관성 있게 요약해주세요.
`;

    const input = {
      text: meetingContext + '\n\n' + verboseResult.text,
      segments: verboseResult.segments,
      language: verboseResult.language,
      duration: estimatedDuration,
      speakers: verboseResult.speakers
    };

    const result = await summaryProvider.summarize(input, {
      model: effectiveSummarySettings.model
    });

    if (this.config.isDebugMode()) {
      console.log(`🔧 ATTN Debug: Standard summary completed using ${effectiveSummarySettings.provider}/${effectiveSummarySettings.model}`);
      console.log(`🔧 ATTN Debug: Used ${verboseResult.segments.length} segments for enhanced summarization`);
    }

    return result;
  }

  private async hierarchicalSummarization(verboseResult: VerboseTranscriptionResult, customSystemPrompt?: string): Promise<string> {
    const effectiveSummarySettings = {
      ...this.settings.summary,
      apiKey: this.settings.summary.apiKey || this.settings.openaiApiKey || this.config.getOpenAIApiKey() || ''
    };

    if (!effectiveSummarySettings.apiKey && effectiveSummarySettings.provider === 'openai') {
      throw new Error('Summary API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.');
    }

    const summaryProvider = createSummarizationProvider(effectiveSummarySettings);
    const estimatedDuration = verboseResult.duration || this.estimateAudioDuration(verboseResult);
    const speakerInfo = verboseResult.speakers ? 
      `참석자: ${verboseResult.speakers.length}명` : 
      '참석자: 화자 분리 정보 없음';

    if (this.config.isDebugMode()) {
      console.log(`🔧 ATTN Debug: Starting hierarchical summarization for ${verboseResult.segments.length} segments`);
    }

    // Phase 1: Create partial summaries from segment groups
    const partialSummaries = await this.createPartialSummaries(verboseResult, summaryProvider, effectiveSummarySettings);
    
    if (this.config.isDebugMode()) {
      console.log(`🔧 ATTN Debug: Created ${partialSummaries.length} partial summaries`);
    }

    // Phase 2: Consolidate partial summaries into final summary
    const finalSummaryContext = `
이것은 약 ${Math.round(estimatedDuration / 60)}분간의 회의에서 생성된 ${partialSummaries.length}개의 부분 요약을 통합한 내용입니다.
${speakerInfo}

각 부분 요약의 내용과 맥락을 종합하여 일관성 있고 포괄적인 최종 회의록을 작성해주세요.
회의의 전체적인 흐름, 주요 결정사항, 액션 아이템을 명확히 정리해주세요.
`;

    // Check total length and truncate if necessary to avoid token limits
    const maxTokens = 12000; // Conservative limit for GPT models
    const estimatedTokens = (finalSummaryContext.length + partialSummaries.join('\n\n---\n\n').length) / 4;
    
    let consolidatedText = finalSummaryContext + '\n\n' + partialSummaries.join('\n\n---\n\n');
    
    if (estimatedTokens > maxTokens) {
      // Truncate partial summaries if too long
      const maxPartialLength = Math.floor((maxTokens * 4 - finalSummaryContext.length) / partialSummaries.length);
      const truncatedSummaries = partialSummaries.map(summary => 
        summary.length > maxPartialLength ? summary.substring(0, maxPartialLength) + '...' : summary
      );
      
      consolidatedText = finalSummaryContext + '\n\n' + truncatedSummaries.join('\n\n---\n\n');
      
      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Truncated summaries to fit token limit (${estimatedTokens} -> ${consolidatedText.length / 4} est. tokens)`);
      }
    }

    const consolidatedInput = {
      text: consolidatedText,
      segments: [], // Not needed for final consolidation
      language: verboseResult.language,
      duration: estimatedDuration,
      speakers: verboseResult.speakers
    };

    try {
      const finalSummary = await summaryProvider.summarize(consolidatedInput, {
        model: effectiveSummarySettings.model
      });
      
      return finalSummary;
    } catch (error) {
      // Fallback: if final consolidation fails, return concatenated partial summaries
      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Final consolidation failed, returning concatenated summaries: ${(error as Error).message}`);
      }
      
      return partialSummaries.join('\n\n=== 구간 요약 ===\n\n');
    }
  }

  private async createPartialSummaries(
    verboseResult: VerboseTranscriptionResult, 
    summaryProvider: any,
    effectiveSummarySettings: any
  ): Promise<string[]> {
    const groupSize = 8; // Reduced from 12 to 8 for better token management
    const segmentGroups = this.chunkArray(verboseResult.segments, groupSize);
    const partialSummaries: string[] = [];

    // Process groups sequentially to avoid rate limits (changed from parallel)
    for (let i = 0; i < segmentGroups.length; i++) {
      const group = segmentGroups[i];
      const globalGroupIndex = i;
      const groupStartTime = group[0]?.start || 0;
      const groupEndTime = group[group.length - 1]?.end || 0;
      
      const groupText = group.map(segment => segment.text).join(' ');
      
      // Check text length and truncate if too long
      const maxGroupLength = 3000; // Conservative limit per group
      const truncatedGroupText = groupText.length > maxGroupLength ? 
        groupText.substring(0, maxGroupLength) + '...' : groupText;
      
      const groupContext = `
이것은 회의의 ${this.formatTime(groupStartTime)}부터 ${this.formatTime(groupEndTime)}까지의 내용입니다 (구간 ${globalGroupIndex + 1}/${segmentGroups.length}).

이 구간의 주요 내용을 간결하게 요약해주세요 (2-3문장으로):
`;

      const input = {
        text: groupContext + '\n\n' + truncatedGroupText,
        segments: group,
        language: verboseResult.language
      };

      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Processing group ${globalGroupIndex + 1}/${segmentGroups.length} (${group.length} segments, ${truncatedGroupText.length} chars)`);
      }

      try {
        const partialSummary = await summaryProvider.summarize(input, {
          model: effectiveSummarySettings.model
        });
        partialSummaries.push(partialSummary);
        
        if (this.config.isDebugMode()) {
          console.log(`🔧 ATTN Debug: Successfully processed group ${globalGroupIndex + 1}`);
        }
      } catch (error) {
        console.warn(`Failed to create partial summary for group ${globalGroupIndex + 1}:`, error);
        // Add a fallback summary using the original text
        const fallbackSummary = `구간 ${globalGroupIndex + 1} (${this.formatTime(groupStartTime)}-${this.formatTime(groupEndTime)}): ${truncatedGroupText.substring(0, 200)}...`;
        partialSummaries.push(fallbackSummary);
      }

      // Rate limiting delay between groups
      if (i < segmentGroups.length - 1) {
        await this.sleep(1500); // 1.5 second delay between groups
      }
    }

    return partialSummaries;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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