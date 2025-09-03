import OpenAI from 'openai';
import { ConfigLoader } from './configLoader';

export interface ProcessAudioResult {
  transcript: string;
  summary: string;
}

export class ApiService {
  private openai: OpenAI;
  private config: ConfigLoader;

  constructor(apiKey?: string) {
    this.config = ConfigLoader.getInstance();
    
    // Try to get API key from config file first, then fallback to parameter
    const configApiKey = this.config.getOpenAIApiKey();
    const finalApiKey = configApiKey || apiKey;

    if (!finalApiKey || typeof finalApiKey !== 'string' || finalApiKey.trim() === '') {
      throw new Error('API 키가 필요합니다. config.json 파일을 생성하거나 설정에서 API 키를 입력해주세요.');
    }

    this.openai = new OpenAI({
      apiKey: finalApiKey,
      dangerouslyAllowBrowser: true,
    });

    if (this.config.isDebugMode()) {
      console.log('🔧 ATTN Debug: ApiService initialized with config file');
    }
  }

  async processAudioFile(audioFile: File, systemPrompt?: string): Promise<ProcessAudioResult> {
    try {
      // Step 1: Transcribe audio using Whisper
      const transcription = await this.transcribeAudio(audioFile);
      
      if (!transcription || transcription.trim() === '') {
        throw new Error('음성 인식 결과가 비어있습니다.');
      }

      // Step 2: Summarize transcription using GPT with custom system prompt
      const summary = await this.summarizeText(transcription, systemPrompt);
      
      if (!summary || summary.trim() === '') {
        throw new Error('요약 결과가 비어있습니다.');
      }

      return {
        transcript: transcription,
        summary: summary
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

  private async transcribeAudio(audioFile: File): Promise<string> {
    try {
      const whisperModel = this.config.getWhisperModel();
      const openaiSettings = this.config.getOpenAISettings();

      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: whisperModel,
        language: openaiSettings?.language || 'ko',
      });

      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Transcription completed using ${whisperModel}`);
      }

      return response.text;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`음성 인식 실패: ${error.message}`);
      }
      throw error;
    }
  }

  private async summarizeText(text: string, customSystemPrompt?: string): Promise<string> {
    try {
      const openaiSettings = this.config.getOpenAISettings();
      const model = openaiSettings?.model || 'gpt-4';
      const temperature = openaiSettings?.temperature || 0.3;

      // Use custom system prompt if provided, otherwise use default
      const systemPrompt = customSystemPrompt || 
        '당신은 회의록 정리 전문가입니다. 주어진 회의 내용을 체계적으로 정리하여 명확하고 유용한 회의록을 작성해주세요.';

      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `다음 회의 내용을 정리해주세요:\n\n${text}`,
          },
        ],
        temperature: temperature,
      });

      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Summary completed using ${model} (temp: ${temperature})`);
        console.log(`🔧 ATTN Debug: System prompt: ${systemPrompt.substring(0, 100)}...`);
      }

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`요약 생성 실패: ${error.message}`);
      }
      throw error;
    }
  }
}