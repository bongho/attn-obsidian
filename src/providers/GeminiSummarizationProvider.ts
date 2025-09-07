import { SummarizationProvider, SummarySettings, VerboseTranscriptionResult } from '../types';

export class GeminiSummarizationProvider implements SummarizationProvider {
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
    // TODO: Implement Gemini API integration for summarization
    // This is a stub implementation for testing the provider pattern
    
    throw new Error('Gemini summarization provider not yet implemented. Please use OpenAI or Local LLM providers.');
    
    // Future implementation would call Gemini API
    // and return the summary string
  }
}