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
    
    // Extremely aggressive text truncation for GPT-4's limited context
    const maxInputTokens = maxTokens * 0.4; // Use only 40% of tokens for input, 60% for output
    
    if (this.estimateTokens(userPrompt) > maxInputTokens) {
      // Calculate how much text we can safely include
      const targetLength = Math.floor(maxInputTokens * 3); // Roughly 3 chars per token
      const truncatedText = input.text.substring(0, targetLength * 0.9); // Leave room for prompt text
      
      console.log('🔍 TEXT TRUNCATION:', {
        originalLength: input.text.length,
        targetLength: targetLength * 0.9,
        truncatedLength: truncatedText.length,
        estimatedTokens: this.estimateTokens(truncatedText)
      });
      
      userPrompt = `다음 회의 내용을 정리해주세요 (긴 내용으로 인해 일부만 표시):\n\n${truncatedText}\n\n[회의가 계속되었지만 토큰 제한으로 인해 생략되었습니다. 위 내용을 바탕으로 회의록을 작성해주세요.]`;
    }

    const systemPrompt = '당신은 회의록 정리 전문가입니다. 주어진 회의 내용을 체계적으로 정리하여 명확하고 유용한 회의록을 작성해주세요. 시간별 구간 정보가 있다면 이를 활용하여 더욱 상세하고 구조화된 회의록을 만들어주세요.';

    // Calculate safe max_tokens for response
    const inputTokens = this.estimateTokens(systemPrompt + userPrompt);
    const availableTokens = maxTokens - inputTokens - 100; // 100 token buffer
    const safeMaxTokens = Math.max(500, Math.min(2000, availableTokens)); // Between 500-2000 tokens
    
    console.log('🔍 TOKEN CALCULATION:', {
      model,
      maxTokens,
      inputTokens,
      availableTokens,
      safeMaxTokens,
      inputLength: userPrompt.length
    });

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: safeMaxTokens,
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
    // Ultra conservative estimation for Korean text: ~2 characters per token
    // This accounts for mixed Korean/English content, special tokens, and encoding overhead
    return Math.ceil(text.length / 2);
  }

  private getMaxTokensForModel(model: string): number {
    // Extremely conservative token limits for total context (input + output)
    const modelLimits: Record<string, number> = {
      'gpt-4': 6000, // Ultra conservative for GPT-4 (8192 - 2192 buffer)
      'gpt-4-turbo': 120000,
      'gpt-4o': 120000,
      'gpt-4o-mini': 120000,
      'gpt-3.5-turbo': 15000,
    };
    
    // Find matching model or use conservative default
    const matchingModel = Object.keys(modelLimits).find(key => model.toLowerCase().includes(key));
    return matchingModel ? modelLimits[matchingModel] : 6000; // Conservative default
  }
}