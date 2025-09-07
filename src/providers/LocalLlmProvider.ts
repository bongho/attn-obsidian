import { SummarizationProvider, SummarySettings, VerboseTranscriptionResult } from '../types';

export class LocalLlmProvider implements SummarizationProvider {
  private settings: SummarySettings;

  constructor(settings: SummarySettings) {
    this.settings = settings;
  }

  async summarize(
    input: { 
      text: string; 
      segments?: VerboseTranscriptionResult['segments']; 
      language?: string; 
    }, 
    options: { model?: string }
  ): Promise<string> {
    const endpoint = this.settings.ollamaEndpoint;
    if (!endpoint) {
      throw new Error('Ollama endpoint is required for local LLM provider');
    }

    const model = options.model || this.settings.model || 'llama3.1';
    
    // Create enhanced prompt with segment information if available
    let prompt = `다음 회의 내용을 정리해주세요:\n\n${input.text}`;
    
    if (input.segments && input.segments.length > 0) {
      prompt += '\n\n시간별 구간 정보:\n';
      input.segments.forEach((segment, index) => {
        const startTime = this.formatTime(segment.start);
        const endTime = this.formatTime(segment.end);
        prompt += `${startTime}-${endTime}: ${segment.text}\n`;
      });
      prompt += '\n위 시간대별 정보를 참고하여 더욱 구체적인 회의록을 작성해주세요.';
    }

    const systemMessage = '당신은 회의록 정리 전문가입니다. 주어진 회의 내용을 체계적으로 정리하여 명확하고 유용한 회의록을 작성해주세요. 시간별 구간 정보가 있다면 이를 활용하여 더욱 상세하고 구조화된 회의록을 만들어주세요.';

    const requestBody = {
      model: model,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: {
        temperature: 0.3,
      }
    };

    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.message || !result.message.content) {
        throw new Error('No response from Ollama API');
      }

      return result.message.content;
    } catch (error) {
      throw new Error(`Local LLM summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}