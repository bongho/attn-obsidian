// Provider Types
export type SttProvider = 'openai' | 'gemini' | 'local-whisper';
export type SummaryProvider = 'openai' | 'gemini' | 'local-llm';
export type WhisperBackend = 'faster-whisper-cpp' | 'whisper.cpp';

// Speaker diarization result
export interface Speaker {
  id: string;
  label: string; // "Speaker 1", "Speaker 2", etc.
  confidence?: number;
}

export interface SpeakerSegment {
  start: number;
  end: number;
  speaker: Speaker;
  confidence?: number;
}

// Enhanced word with speaker information
export interface Word {
  start: number;
  end: number;
  word: string;
  speaker?: Speaker;
}

// Enhanced segment with speaker information
export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: Speaker;
  words?: Word[];
}

// Verbose Transcription Result with speaker diarization support
export interface VerboseTranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments: TranscriptionSegment[];
  speakers?: Speaker[]; // List of detected speakers
  speakerSegments?: SpeakerSegment[]; // Speaker timeline
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

export interface DiarizationSettings {
  enabled: boolean;
  provider?: 'pyannote' | 'whisperx' | 'local';
  minSpeakers?: number;
  maxSpeakers?: number;
  apiKey?: string;
  modelPath?: string;
  mergeThreshold?: number; // Seconds - merge segments from same speaker if gap is smaller
}

export interface ProcessingSettings {
  enableChunking: boolean;
  maxUploadSizeMB?: number;
  maxChunkDurationSec?: number;
  targetSampleRateHz?: number;
  targetChannels?: 1 | 2;
  silenceThresholdDb?: number;
  minSilenceMs?: number;
  hardSplitWindowSec?: number;
  preserveIntermediates?: boolean;
  diarization?: DiarizationSettings;
}

export interface LoggingSettings {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug';
  logFilePath?: string;
  maxLogFileBytes?: number;
  maxLogFiles?: number;
}

export interface LogContext {
  requestId: string;
  provider: string;
  model: string;
  filePath?: string;
  chunkIndex?: number | null;
  chunkCount?: number | null;
  durationSec?: number;
  sizeBytes?: number;
  status?: number;
  responseBody?: unknown;
  context?: Record<string, unknown>;
}

export interface SegmentOptions {
  maxUploadSizeMB?: number;
  maxChunkDurationSec?: number;
  targetSampleRateHz?: number;
  targetChannels?: 1 | 2;
  silenceThresholdDb?: number;
  minSilenceMs?: number;
  hardSplitWindowSec?: number;
  preserveIntermediates?: boolean;
  enablePreprocessing?: boolean;
  audioCodec?: string;
  audioBitrate?: string;
}

export interface SegmentResult {
  bufferOrPath: Buffer | string;
  startSec: number;
  endSec: number;
  sizeBytes: number;
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
  processing: ProcessingSettings;
  logging: LoggingSettings;
}

export type AudioSpeedOption = 1 | 2 | 3;