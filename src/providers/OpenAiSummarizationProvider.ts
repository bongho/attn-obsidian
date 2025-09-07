import { SummarizationProvider, SummarySettings, VerboseTranscriptionResult } from '../types';

export class OpenAiSummarizationProvider implements SummarizationProvider {
  private settings: SummarySettings;
  private baseUrl: string;

  constructor(settings: SummarySettings) {
    this.settings = settings;
    this.baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
  }

  async summarize(
    input: { 
      text: string; 
      segments?: VerboseTranscriptionResult['segments']; 
      language?: string; 
    }, 
    options: { model?: string }
  ): Promise<string> {
    const apiKey = this.settings.apiKey || this.getApiKeyFromEnv();
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const model = options.model || this.settings.model || 'gpt-4';
    
    // Create enhanced prompt with segment information if available
    let userPrompt = `다음 회의 내용을 정리해주세요:\n\n${input.text}`;
    
    if (input.segments && input.segments.length > 0) {
      userPrompt += '\n\n시간별 구간 정보:\n';
      input.segments.forEach((segment, index) => {
        const startTime = this.formatTime(segment.start);
        const endTime = this.formatTime(segment.end);
        userPrompt += `${startTime}-${endTime}: ${segment.text}\n`;
      });
      userPrompt += '\n위 시간대별 정보를 참고하여 더욱 구체적인 회의록을 작성해주세요.';
    }

    const systemPrompt = '당신은 회의록 정리 전문가입니다. 주어진 회의 내용을 체계적으로 정리하여 명확하고 유용한 회의록을 작성해주세요. 시간별 구간 정보가 있다면 이를 활용하여 더욱 상세하고 구조화된 회의록을 만들어주세요.';

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from OpenAI API');
    }

    return result.choices[0].message.content || '';
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private getApiKeyFromEnv(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }
}