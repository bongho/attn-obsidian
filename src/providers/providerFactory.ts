import { SttSettings, SummarySettings, SpeechToTextProvider, SummarizationProvider } from '../types';
import { OpenAiSttProvider } from './OpenAiSttProvider';
import { OpenAiSummarizationProvider } from './OpenAiSummarizationProvider';
import { GeminiSttProvider } from './GeminiSttProvider';
import { GeminiSummarizationProvider } from './GeminiSummarizationProvider';
import { LocalWhisperProvider } from './LocalWhisperProvider';
import { LocalMlxWhisperProvider } from './LocalMlxWhisperProvider';
import { LocalLlmProvider } from './LocalLlmProvider';

export function createSttProvider(
  settings: SttSettings,
  timeoutMs?: number,
  mlxBridgeScriptPath?: string
): SpeechToTextProvider {
  switch (settings.provider) {
    case 'openai':
      return new OpenAiSttProvider(settings, timeoutMs);
    case 'gemini':
      return new GeminiSttProvider(settings, timeoutMs);
    case 'groq':
      // Groq uses OpenAI-compatible API with different baseUrl
      const groqSettings = {
        ...settings,
        baseUrl: 'https://api.groq.com/openai/v1',
        model: settings.model || 'whisper-large-v3'
      };
      return new OpenAiSttProvider(groqSettings, timeoutMs);
    case 'local-whisper':
      return new LocalWhisperProvider(settings);
    case 'local-mlx':
      return new LocalMlxWhisperProvider(settings, mlxBridgeScriptPath);
    default:
      throw new Error(`Unknown STT provider: ${(settings as any).provider}`);
  }
}

export function createSummarizationProvider(settings: SummarySettings, timeoutMs?: number): SummarizationProvider {
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