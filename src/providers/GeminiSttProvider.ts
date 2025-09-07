import { SpeechToTextProvider, SttSettings, VerboseTranscriptionResult } from '../types';

export class GeminiSttProvider implements SpeechToTextProvider {
  private settings: SttSettings;

  constructor(settings: SttSettings) {
    this.settings = settings;
  }

  async transcribe(
    input: ArrayBuffer | Buffer | string, 
    options: { format: 'verbose_json' | 'text'; language?: string; model?: string }
  ): Promise<VerboseTranscriptionResult> {
    // TODO: Implement Gemini speech-to-text API integration
    // This is a stub implementation for testing the provider pattern
    
    throw new Error('Gemini STT provider not yet implemented. Please use OpenAI or Local Whisper providers.');
    
    // Future implementation would call Gemini Speech-to-Text API
    // and return properly formatted VerboseTranscriptionResult
  }
}