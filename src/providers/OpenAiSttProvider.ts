import { SpeechToTextProvider, SttSettings, VerboseTranscriptionResult } from '../types';

export class OpenAiSttProvider implements SpeechToTextProvider {
  private settings: SttSettings;
  private baseUrl: string;

  constructor(settings: SttSettings) {
    this.settings = settings;
    this.baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
  }

  async transcribe(
    input: ArrayBuffer | Buffer | string, 
    options: { format: 'verbose_json' | 'text'; language?: string; model?: string }
  ): Promise<VerboseTranscriptionResult> {
    const apiKey = this.settings.apiKey || this.getApiKeyFromEnv();
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Convert input to File-like object for FormData
    const audioFile = this.convertToFile(input);
    
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', options.model || this.settings.model || 'whisper-1');
    formData.append('response_format', options.format || 'verbose_json');
    
    if (options.language || this.settings.language) {
      formData.append('language', options.language || this.settings.language!);
    }

    const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      const errorCode = errorData.error?.code || response.status;
      const errorType = errorData.error?.type || 'api_error';
      
      console.error('OpenAI STT API Error:', {
        status: response.status,
        message: errorMessage,
        code: errorCode,
        type: errorType,
        model: options.model || this.settings.model
      });
      
      throw new Error(`OpenAI STT API error (${response.status}): ${errorMessage}`);
    }

    const result = await response.json();

    // Validate and enhance the response
    if (!result.text && (!result.segments || result.segments.length === 0)) {
      console.warn('OpenAI STT returned empty result:', {
        hasText: !!result.text,
        hasSegments: !!result.segments,
        segmentCount: result.segments?.length || 0
      });
    }
    
    // Ensure the response has the verbose_json structure
    if (options.format === 'verbose_json' && result.segments) {
      // Try to recover text from segments if main text is empty
      let finalText = result.text || '';
      if (!finalText && result.segments && result.segments.length > 0) {
        finalText = result.segments.map((seg: any) => seg.text).join(' ').trim();
        console.log('Recovered text from segments:', finalText.substring(0, 200));
      }
      
      return {
        text: finalText,
        language: result.language,
        duration: result.duration,
        segments: result.segments,
        raw: result
      };
    } else {
      // Fallback for text format or when segments are not available
      return {
        text: result.text || result,
        segments: [],
        raw: result
      };
    }
  }

  private convertToFile(input: ArrayBuffer | Buffer | string): File {
    let buffer: Uint8Array;
    
    if (typeof input === 'string') {
      // Assume base64 encoded audio data
      buffer = new Uint8Array(Buffer.from(input, 'base64'));
    } else if (input instanceof ArrayBuffer) {
      buffer = new Uint8Array(input);
    } else {
      buffer = new Uint8Array(input);
    }

    return new File([buffer], 'audio.m4a', { type: 'audio/m4a' });
  }

  private getApiKeyFromEnv(): string | undefined {
    return process.env.OPENAI_API_KEY;
  }

  private async handleApiError(response: Response): Promise<never> {
    const status = response.status;
    const statusText = response.statusText;
    
    let errorData: any;
    let errorMessage = `OpenAI API error: ${status} ${statusText}`;
    
    try {
      errorData = await response.json();
      if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      }
    } catch {
      // If JSON parsing fails, try text
      try {
        const textResponse = await response.text();
        if (textResponse) {
          errorMessage = textResponse;
        }
      } catch {
        // Keep default error message
      }
    }

    // Create enhanced error with status and response data for retry logic
    const error = new Error(errorMessage) as any;
    error.status = status;
    error.response = {
      status,
      statusText,
      data: errorData
    };
    
    // Add error code for network-level errors
    if (status >= 500) {
      error.code = `HTTP_${status}`;
    }

    throw error;
  }
}