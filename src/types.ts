export interface ATTNSettings {
  openaiApiKey: string;
  saveFolderPath: string;
  noteFilenameTemplate: string;
  noteContentTemplate: string;
  audioSpeedMultiplier: number;
}

export type AudioSpeedOption = 1 | 2 | 3;