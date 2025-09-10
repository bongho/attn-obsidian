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
    
    // Estimate tokens and truncate if necessary
    const maxTokens = this.getMaxTokensForModel(model);
    const estimatedInputTokens = this.estimateTokens(input.text);
    
    // Create enhanced prompt with segment information if available
    let userPrompt = `다음 회의 내용을 정리해주세요:\n\n${input.text}`;
    
    if (input.segments && input.segments.length > 0 && estimatedInputTokens < maxTokens * 0.6) {
      // Only add segment details if we have room in token budget
      userPrompt += '\n\n시간별 구간 정보:\n';
      let segmentInfo = '';
      for (const segment of input.segments.slice(0, 20)) { // Limit to first 20 segments
        const startTime = this.formatTime(segment.start);
        const endTime = this.formatTime(segment.end);
        const segmentText = segment.text.length > 100 ? segment.text.substring(0, 100) + '...' : segment.text;
        const newSegmentInfo = `${startTime}-${endTime}: ${segmentText}\n`;
        
        if (this.estimateTokens(userPrompt + segmentInfo + newSegmentInfo) > maxTokens * 0.8) {
          break; // Stop adding segments if we're approaching token limit
        }
        segmentInfo += newSegmentInfo;
      }
      
      if (segmentInfo) {
        userPrompt += segmentInfo + '\n위 시간대별 정보를 참고하여 더욱 구체적인 회의록을 작성해주세요.';
      }
    }
    
    // Final check and truncation if still too long
    if (this.estimateTokens(userPrompt) > maxTokens * 0.8) {
      const targetLength = Math.floor(maxTokens * 0.8 * 3); // Roughly 3 chars per token
      userPrompt = userPrompt.substring(0, targetLength) + '\n\n[텍스트가 너무 길어 일부가 생략되었습니다. 위 내용을 바탕으로 회의록을 작성해주세요.]';
    }

    const systemPrompt = '당신은 회의록 정리 전문가입니다. 주어진 회의 내용을 체계적으로 정리하여 명확하고 유용한 회의록을 작성해주세요. 시간별 구간 정보가 있다면 이를 활용하여 더욱 상세하고 구조화된 회의록을 만들어주세요.';

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: Math.min(4000, maxTokens - this.estimateTokens(systemPrompt + userPrompt) - 100), // Reserve tokens for response
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
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      const errorCode = errorData.error?.code || 'unknown';
      const errorType = errorData.error?.type || 'unknown';
      
      console.error('OpenAI API Error Details:', {
        status: response.status,
        message: errorMessage,
        code: errorCode,
        type: errorType,
        model: model
      });
      
      throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
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

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for Korean text
    return Math.ceil(text.length / 3);
  }

  private getMaxTokensForModel(model: string): number {
    // Conservative token limits to avoid API errors
    const modelLimits: Record<string, number> = {
      'gpt-4': 6000,
      'gpt-4-turbo': 100000,
      'gpt-4o': 100000,
      'gpt-4o-mini': 100000,
      'gpt-3.5-turbo': 14000,
    };
    
    // Find matching model or use conservative default
    const matchingModel = Object.keys(modelLimits).find(key => model.toLowerCase().includes(key));
    return matchingModel ? modelLimits[matchingModel] : 6000; // Conservative default
  }
}