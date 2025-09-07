// Provider Types
export type SttProvider = 'openai' | 'gemini' | 'local-whisper';
export type SummaryProvider = 'openai' | 'gemini' | 'local-llm';
export type WhisperBackend = 'faster-whisper-cpp' | 'whisper.cpp';

// Verbose Transcription Result
export interface VerboseTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    words?: Array<{
      start: number;
      end: number;
      word: string;
    }>;
  }>;
  raw?: unknown; // Original API response
}

// Provider Interfaces
export interface SpeechToTextProvider {
  transcribe(
    input: ArrayBuffer | Buffer | string, 
    options: { 
      format: 'verbose_json' | 'text'; 
      language?: string; 
      model?: string; 
    }
  ): Promise<VerboseTranscriptionResult>;
}

export interface SummarizationProvider {
  summarize(
    input: { 
      text: string; 
      segments?: VerboseTranscriptionResult['segments']; 
      language?: string; 
    }, 
    options: { 
      model?: string; 
    }
  ): Promise<string>;
}

// Settings Types
export interface SttSettings {
  provider: SttProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  language?: string;
  ollamaEndpoint?: string;
  whisperBinaryPath?: string;
  whisperModelPathOrName?: string;
  whisperBackend?: WhisperBackend;
}

export interface SummarySettings {
  provider: SummaryProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  ollamaEndpoint?: string;
}

export interface ATTNSettings {
  openaiApiKey: string; // Legacy field for backward compatibility
  saveFolderPath: string;
  noteFilenameTemplate: string;
  noteContentTemplate: string;
  noteContentTemplateFile: string;
  useTemplateFile: boolean;
  systemPrompt: string;
  audioSpeedMultiplier: number;
  ffmpegPath: string;
  stt: SttSettings;
  summary: SummarySettings;
}

export type AudioSpeedOption = 1 | 2 | 3;