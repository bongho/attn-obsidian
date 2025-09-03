import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ConfigFile {
  openai: {
    apiKey: string;
    model: {
      whisper: string;
      chat: string;
    };
    settings: {
      temperature: number;
      language: string;
    };
  };
  plugin: {
    version: string;
    debug: boolean;
  };
}

export class ConfigLoader {
  private static instance: ConfigLoader | null = null;
  private config: ConfigFile | null = null;
  private configPath: string;

  private constructor() {
    // Try multiple possible config file locations
    const possiblePaths = [
      join(process.cwd(), 'config.json'),
      join(process.cwd(), 'api-keys.json'),
      join(process.cwd(), 'openai-config.json'),
      join(process.cwd(), '.secrets', 'config.json'),
    ];

    this.configPath = '';
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        this.configPath = path;
        break;
      }
    }
  }

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public loadConfig(): ConfigFile | null {
    if (this.config) {
      return this.config;
    }

    if (!this.configPath) {
      // Config file is optional, so don't show warning unless debug mode is needed
      return null;
    }

    try {
      const configData = readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData) as ConfigFile;
      
      // Validate required fields
      if (!this.config.openai?.apiKey || this.config.openai.apiKey.startsWith('sk-your-')) {
        console.error('❌ ATTN: Invalid OpenAI API key in config file');
        return null;
      }

      console.log('✅ ATTN: Configuration loaded successfully');
      return this.config;
    } catch (error) {
      console.error('❌ ATTN: Failed to load config file:', error);
      return null;
    }
  }

  public getOpenAIApiKey(): string | null {
    const config = this.loadConfig();
    return config?.openai?.apiKey || null;
  }

  public getOpenAISettings(): { model: string; temperature: number; language: string } | null {
    const config = this.loadConfig();
    if (!config) return null;

    return {
      model: config.openai.model.chat,
      temperature: config.openai.settings.temperature,
      language: config.openai.settings.language,
    };
  }

  public getWhisperModel(): string {
    const config = this.loadConfig();
    return config?.openai?.model?.whisper || 'whisper-1';
  }

  public isDebugMode(): boolean {
    const config = this.loadConfig();
    return config?.plugin?.debug || false;
  }

  public getConfigPath(): string {
    if (!this.configPath) {
      return 'No config file found (using plugin settings)';
    }
    return this.configPath;
  }
}