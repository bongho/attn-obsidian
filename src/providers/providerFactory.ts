import { SttSettings, SummarySettings, SpeechToTextProvider, SummarizationProvider } from '../types';
import { OpenAiSttProvider } from './OpenAiSttProvider';
import { OpenAiSummarizationProvider } from './OpenAiSummarizationProvider';
import { GeminiSttProvider } from './GeminiSttProvider';
import { GeminiSummarizationProvider } from './GeminiSummarizationProvider';
import { LocalWhisperProvider } from './LocalWhisperProvider';
import { LocalLlmProvider } from './LocalLlmProvider';

export function createSttProvider(settings: SttSettings): SpeechToTextProvider {
  switch (settings.provider) {
    case 'openai':
      return new OpenAiSttProvider(settings);
    case 'gemini':
      return new GeminiSttProvider(settings);
    case 'local-whisper':
      return new LocalWhisperProvider(settings);
    default:
      throw new Error(`Unknown STT provider: ${(settings as any).provider}`);
  }
}

export function createSummarizationProvider(settings: SummarySettings): SummarizationProvider {
  switch (settings.provider) {
    case 'openai':
      return new OpenAiSummarizationProvider(settings);
    case 'gemini':
      return new GeminiSummarizationProvider(settings);
    case 'local-llm':
      return new LocalLlmProvider(settings);
    default:
      throw new Error(`Unknown summarization provider: ${(settings as any).provider}`);
  }
}