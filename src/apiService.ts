import OpenAI from 'openai';

export class ApiService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('API 키가 필요합니다.');
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async processAudioFile(audioFile: File): Promise<string> {
    try {
      // Step 1: Transcribe audio using Whisper
      const transcription = await this.transcribeAudio(audioFile);
      
      if (!transcription || transcription.trim() === '') {
        throw new Error('음성 인식 결과가 비어있습니다.');
      }

      // Step 2: Summarize transcription using GPT
      const summary = await this.summarizeText(transcription);
      
      if (!summary || summary.trim() === '') {
        throw new Error('요약 결과가 비어있습니다.');
      }

      return summary;
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
      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'ko',
      });

      return response.text;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`음성 인식 실패: ${error.message}`);
      }
      throw error;
    }
  }

  private async summarizeText(text: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: '당신은 회의록 정리 전문가입니다. 주어진 회의 내용을 체계적으로 정리하여 명확하고 유용한 회의록을 작성해주세요.',
          },
          {
            role: 'user',
            content: `다음 회의 내용을 정리해주세요:\n\n${text}`,
          },
        ],
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`요약 생성 실패: ${error.message}`);
      }
      throw error;
    }
  }
}