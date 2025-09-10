import { ConfigLoader } from './configLoader';
import { createSttProvider, createSummarizationProvider } from './providers/providerFactory';
import { ATTNSettings, VerboseTranscriptionResult } from './types';

export interface ProcessAudioResult {
  transcript: string;
  summary: string;
  transcriptionResult: VerboseTranscriptionResult; // Detailed transcription data
}

export class ApiService {
  private config: ConfigLoader;
  private settings: ATTNSettings;

  constructor(settings: ATTNSettings) {
    this.config = ConfigLoader.getInstance();
    this.settings = settings;

    if (this.config.isDebugMode()) {
      console.log('🔧 ATTN Debug: ApiService initialized with new provider system');
    }
  }

  async processAudioFile(audioFile: File, systemPrompt?: string): Promise<ProcessAudioResult> {
    try {
      // Check if file is large enough to require chunking
      const maxSizeMB = this.settings.processing?.maxUploadSizeMB || 24.5;
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      
      let verboseResult: VerboseTranscriptionResult;
      
      if (audioFile.size > maxSizeBytes && this.settings.processing?.enableChunking) {
        // Use chunking workflow: transcribe all chunks first, then process complete result
        verboseResult = await this.processWithChunking(audioFile);
      } else {
        // Direct transcription for smaller files
        verboseResult = await this.transcribeAudioVerbose(audioFile);
      }
      
      if (!verboseResult.text || verboseResult.text.trim() === '') {
        throw new Error('음성 인식 결과가 비어있습니다.');
      }

      // Step 2: Summarize the complete transcription result
      const summary = await this.summarizeWithSegments(verboseResult, systemPrompt);
      
      if (!summary || summary.trim() === '') {
        throw new Error('요약 결과가 비어있습니다.');
      }

      return {
        transcript: verboseResult.text,
        summary: summary,
        transcriptionResult: verboseResult
      };
    } catch (error) {
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
        console.log(`🔧 ATTN Debug: Summary completed using ${effectiveSummarySettings.provider}/${effectiveSummarySettings.model}`);
        console.log(`🔧 ATTN Debug: Used ${verboseResult.segments.length} segments for enhanced summarization`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`요약 생성 실패: ${error.message}`);
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