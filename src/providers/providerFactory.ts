import { SttSettings, SummarySettings, SpeechToTextProvider, SummarizationProvider } from '../types';
import { OpenAiSttProvider } from './OpenAiSttProvider';
import { OpenAiSummarizationProvider } from './OpenAiSummarizationProvider';
import { GeminiSttProvider } from './GeminiSttProvider';
import { GeminiSummarizationProvider } from './GeminiSummarizationProvider';
import { LocalWhisperProvider } from './LocalWhisperProvider';
import { LocalLlmProvider } from './LocalLlmProvider';

export function createSttProvider(settings: SttSettings, timeoutMs?: number): SpeechToTextProvider {
  switch (settings.provider) {
    case 'openai':
      return new OpenAiSttProvider(settings, timeoutMs);
    case 'gemini':
      return new GeminiSttProvider(settings, timeoutMs);
    case 'local-whisper':
      return new LocalWhisperProvider(settings);
    default:
      throw new Error(`Unknown STT provider: ${(settings as any).provider}`);
  }
}

export function createSummarizationProvider(settings: SummarySettings, timeoutMs?: number): SummarizationProvider {
  switch (settings.provider) {
    case 'openai':
      return new OpenAiSummarizationProvider(settings, timeoutMs);
    case 'gemini':
      return new GeminiSummarizationProvider(settings, timeoutMs);
    case 'local-llm':
      return new LocalLlmProvider(settings);
    default:
      throw new Error(`Unknown summarization provider: ${(settings as any).provider}`);
  }
}