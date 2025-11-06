/**
 * Local MLX Whisper Provider
 * Uses Apple MLX framework for on-device transcription (Apple Silicon only)
 */

import { SpeechToTextProvider, SttSettings, VerboseTranscriptionResult } from '../types';
import { MlxBridge } from '../utils/mlxBridge';
import { PythonEnvChecker } from '../utils/pythonEnvChecker';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

export class LocalMlxWhisperProvider implements SpeechToTextProvider {
  private settings: SttSettings;
  private mlxBridge?: MlxBridge;
  private envChecker: PythonEnvChecker;
  private isInitialized = false;
  private initPromise?: Promise<void>;

  constructor(settings: SttSettings) {
    this.settings = settings;
    this.envChecker = PythonEnvChecker.getInstance();
  }

  /**
   * Initialize MLX bridge (lazy initialization)
   */
  private async initialize(): Promise<void> {
    // Return existing initialization if in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.isInitialized) {
      return;
    }

    this.initPromise = (async () => {
      try {
        // Check environment
        const envStatus = await this.envChecker.checkEnvironment();

        if (!envStatus.pythonAvailable) {
          throw new Error('Python 3.9+ is required for local MLX transcription');
        }

        if (!envStatus.applesilicon) {
          throw new Error('MLX requires Apple Silicon (M1/M2/M3). Please use API-based providers.');
        }

        if (!envStatus.mlxWhisperAvailable) {
          throw new Error(
            'mlx-whisper is not installed. ' +
            'Please install it by running: pip3 install mlx-whisper'
          );
        }

        // Initialize bridge
        const pythonPath = envStatus.pythonPath || 'python3';
        this.mlxBridge = new MlxBridge(pythonPath);
        await this.mlxBridge.initialize();

        // Optionally preload model
        const modelName = this.settings.model || 'mlx-community/whisper-large-v3-mlx';
        console.log(`Preloading MLX Whisper model: ${modelName}...`);
        await this.mlxBridge.loadModel(modelName);

        this.isInitialized = true;
        console.log('✅ Local MLX Whisper provider initialized successfully');
      } catch (error) {
        this.initPromise = undefined;
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Transcribe audio using local MLX Whisper
   */
  async transcribe(
    input: ArrayBuffer | Buffer | string,
    options: {
      format: 'verbose_json' | 'text';
      language?: string;
      model?: string;
      prompt?: string
    }
  ): Promise<VerboseTranscriptionResult> {
    // Initialize if needed
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.mlxBridge) {
      throw new Error('MLX bridge not initialized');
    }

    let tempFilePath: string | undefined;

    try {
      // Save input to temporary file (Python bridge needs file path)
      tempFilePath = await this.saveToTempFile(input);

      // Prepare transcription options
      const transcribeOptions = {
        model: options.model || this.settings.model || 'mlx-community/whisper-large-v3-mlx',
        language: options.language || this.settings.language,
        prompt: options.prompt,
        use_coreml: true // Enable CoreML encoder for 18x speedup
      };

      console.log(`Transcribing with MLX Whisper (${transcribeOptions.model})...`);
      const startTime = Date.now();

      // Transcribe using bridge
      const result = await this.mlxBridge.transcribe(tempFilePath, transcribeOptions);

      const duration = (Date.now() - startTime) / 1000;
      console.log(`✅ MLX transcription completed in ${duration.toFixed(2)}s`);

      return result;

    } catch (error) {
      console.error('MLX transcription error:', error);

      // Add helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('not initialized')) {
          throw new Error('MLX bridge failed to initialize. Check Python and mlx-whisper installation.');
        }
        if (error.message.includes('timeout')) {
          throw new Error('MLX transcription timed out. Try using a smaller model or shorter audio.');
        }
      }

      throw error;

    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        try {
          await unlink(tempFilePath);
        } catch (error) {
          console.warn('Failed to delete temporary file:', tempFilePath, error);
        }
      }
    }
  }

  /**
   * Save input to temporary file
   */
  private async saveToTempFile(input: ArrayBuffer | Buffer | string): Promise<string> {
    // Convert input to Buffer
    let buffer: Buffer;

    if (typeof input === 'string') {
      // Assume base64 encoded
      buffer = Buffer.from(input, 'base64');
    } else if (input instanceof ArrayBuffer) {
      buffer = Buffer.from(input);
    } else {
      buffer = input;
    }

    // Generate unique temporary filename
    const randomId = randomBytes(8).toString('hex');
    const tempFilePath = join(tmpdir(), `attn-mlx-${randomId}.m4a`);

    // Write to file
    await writeFile(tempFilePath, buffer);

    return tempFilePath;
  }

  /**
   * Check if MLX is available on this system
   */
  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.envChecker.checkEnvironment();
      return status.pythonAvailable &&
             status.mlxWhisperAvailable &&
             status.applesilicon;
    } catch {
      return false;
    }
  }

  /**
   * Get environment status for diagnostics
   */
  async getEnvironmentStatus() {
    return await this.envChecker.checkEnvironment();
  }

  /**
   * Install mlx-whisper
   */
  async installMlxWhisper(onProgress?: (message: string) => void): Promise<boolean> {
    return await this.envChecker.installMlxWhisper(onProgress);
  }

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    if (this.mlxBridge) {
      await this.mlxBridge.dispose();
      this.mlxBridge = undefined;
    }
    this.isInitialized = false;
    this.initPromise = undefined;
  }
}
