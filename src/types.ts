export interface ATTNSettings {
  openaiApiKey: string;
  saveFolderPath: string;
  noteFilenameTemplate: string;
  noteContentTemplate: string;
  noteContentTemplateFile: string;
  useTemplateFile: boolean;
  systemPrompt: string;
  audioSpeedMultiplier: number;
  ffmpegPath: string;
}

export type AudioSpeedOption = 1 | 2 | 3;