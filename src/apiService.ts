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
      // Step 1: Transcribe audio using the configured STT provider
      const verboseResult = await this.transcribeAudioVerbose(audioFile);
      
      if (!verboseResult.text || verboseResult.text.trim() === '') {
        throw new Error('음성 인식 결과가 비어있습니다.');
      }

      // Step 2: Summarize transcription using the configured summarization provider
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

      const input = {
        text: verboseResult.text,
        segments: verboseResult.segments,
        language: verboseResult.language
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
}