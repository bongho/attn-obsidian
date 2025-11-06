/**
 * MLX Whisper Bridge
 * Manages communication with Python mlx-whisper process via JSON IPC
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import * as readline from 'readline';
import { VerboseTranscriptionResult } from '../types';

export interface MlxRequest {
  command: 'transcribe' | 'transcribe_batch' | 'load_model' | 'ping' | 'quit';
  audio_path?: string;
  audio_paths?: string[];
  model?: string;
  language?: string;
  prompt?: string;
  use_coreml?: boolean;
  max_workers?: number;
  // Phase 5C: Quality improvement parameters
  use_fallback?: boolean;
  temperature?: number;
  compression_ratio_threshold?: number;
  logprob_threshold?: number;
  no_speech_threshold?: number;
}

export interface MlxResponse {
  status: 'success' | 'error' | 'ready';
  text?: string;
  language?: string;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    avg_logprob?: number;
    no_speech_prob?: number;
  }>;
  processing_time?: number;
  model?: string;
  error?: string;
  traceback?: string;
  message?: string;
  version?: string;
  // Batch response fields
  results?: Array<{
    status: 'success' | 'error';
    audio_path: string;
    text?: string;
    language?: string;
    segments?: any[];
    duration?: number;
    error?: string;
  }>;
  total_time?: number;
  files_processed?: number;
  speedup?: string;
  // Quantization info
  is_quantized?: boolean;
  quantized_alternative?: string;
  quantized_speedup?: string;
  // Phase 5A: CoreML info
  coreml_available?: boolean;
  coreml_encoder?: string;
  coreml_encoder_loaded?: boolean;
  coreml_speedup?: string;
  encoder?: string;
  note?: string;
  // Phase 5C: Quality metrics
  temperature_used?: number;
  quality_score?: number;
  fallback_used?: boolean;
}

export class MlxBridge {
  private process?: ChildProcess;
  private reader?: readline.Interface;
  private isReady = false;
  private requestQueue: Array<{
    request: MlxRequest;
    resolve: (response: MlxResponse) => void;
    reject: (error: Error) => void;
  }> = [];
  private currentRequest?: {
    resolve: (response: MlxResponse) => void;
    reject: (error: Error) => void;
  };

  private pythonPath: string;
  private bridgeScriptPath: string;

  constructor(pythonPath: string = 'python3') {
    this.pythonPath = pythonPath;
    // Assume bridge script is in project root/python directory
    this.bridgeScriptPath = join(__dirname, '../../python/mlx_whisper_bridge.py');
  }

  /**
   * Initialize Python bridge process
   */
  async initialize(): Promise<void> {
    if (this.isReady) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Spawn Python process
        this.process = spawn(this.pythonPath, [this.bridgeScriptPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Set up readline for JSON responses
        this.reader = readline.createInterface({
          input: this.process.stdout!,
          crlfDelay: Infinity
        });

        // Handle responses
        this.reader.on('line', (line) => {
          try {
            const response: MlxResponse = JSON.parse(line);

            // Handle ready signal
            if (response.status === 'ready') {
              console.log(`MLX Bridge ready (mlx-whisper ${response.version})`);
              this.isReady = true;
              resolve();
              return;
            }

            // Handle regular response
            if (this.currentRequest) {
              if (response.status === 'success') {
                this.currentRequest.resolve(response);
              } else {
                this.currentRequest.reject(new Error(response.error || 'Unknown error'));
              }
              this.currentRequest = undefined;
              this.processNextRequest();
            }

          } catch (error) {
            console.error('Failed to parse MLX response:', line, error);
            if (this.currentRequest) {
              this.currentRequest.reject(new Error('Invalid JSON response from MLX bridge'));
              this.currentRequest = undefined;
            }
          }
        });

        // Handle errors
        this.process.stderr!.on('data', (data) => {
          console.error('MLX Bridge stderr:', data.toString());
        });

        this.process.on('error', (error) => {
          console.error('MLX Bridge process error:', error);
          if (!this.isReady) {
            reject(new Error(`Failed to start MLX bridge: ${error.message}`));
          }
        });

        this.process.on('exit', (code, signal) => {
          console.log(`MLX Bridge exited with code ${code}, signal ${signal}`);
          this.isReady = false;
          this.process = undefined;

          // Reject pending requests
          if (this.currentRequest) {
            this.currentRequest.reject(new Error('MLX bridge process exited unexpectedly'));
            this.currentRequest = undefined;
          }
          this.requestQueue.forEach(({ reject }) => {
            reject(new Error('MLX bridge process exited unexpectedly'));
          });
          this.requestQueue = [];
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isReady) {
            this.dispose();
            reject(new Error('MLX bridge initialization timeout (10s)'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send request to MLX bridge
   */
  async sendRequest(request: MlxRequest): Promise<MlxResponse> {
    if (!this.isReady || !this.process) {
      throw new Error('MLX bridge not initialized');
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ request, resolve, reject });
      if (!this.currentRequest) {
        this.processNextRequest();
      }
    });
  }

  /**
   * Process next request in queue
   */
  private processNextRequest(): void {
    if (this.currentRequest || this.requestQueue.length === 0) {
      return;
    }

    const { request, resolve, reject } = this.requestQueue.shift()!;
    this.currentRequest = { resolve, reject };

    // Send request as JSON line
    const requestLine = JSON.stringify(request) + '\n';
    this.process!.stdin!.write(requestLine);
  }

  /**
   * Transcribe audio file
   *
   * Phase 5A: CoreML encoder support (when available)
   * Phase 5C: Quality improvements with temperature fallback
   */
  async transcribe(
    audioPath: string,
    options: {
      model?: string;
      language?: string;
      prompt?: string;
      use_coreml?: boolean;
      // Phase 5C quality options
      use_fallback?: boolean;
      temperature?: number;
      compression_ratio_threshold?: number;
      logprob_threshold?: number;
      no_speech_threshold?: number;
    } = {}
  ): Promise<VerboseTranscriptionResult> {
    const request: MlxRequest = {
      command: 'transcribe',
      audio_path: audioPath,
      model: options.model || 'mlx-community/whisper-large-v3-mlx',
      language: options.language,
      prompt: options.prompt,
      use_coreml: options.use_coreml !== false,
      use_fallback: options.use_fallback || false,
      temperature: options.temperature ?? 0.0,
      compression_ratio_threshold: options.compression_ratio_threshold,
      logprob_threshold: options.logprob_threshold,
      no_speech_threshold: options.no_speech_threshold
    };

    const response = await this.sendRequest(request);

    if (response.status !== 'success') {
      throw new Error(response.error || 'Transcription failed');
    }

    // Convert to VerboseTranscriptionResult format
    return {
      text: response.text || '',
      language: response.language,
      duration: response.segments?.[response.segments.length - 1]?.end || 0,
      segments: response.segments || [],
      raw: response
    };
  }

  /**
   * Transcribe multiple audio files in parallel (Phase 4B batch processing)
   * Provides 2-4x speedup compared to sequential processing
   */
  async transcribeBatch(options: {
    audio_paths: string[];
    model?: string;
    language?: string;
    prompt?: string;
    max_workers?: number;
  }): Promise<MlxResponse> {
    const request: MlxRequest = {
      command: 'transcribe_batch',
      audio_paths: options.audio_paths,
      model: options.model || 'mlx-community/whisper-large-v3-mlx',
      language: options.language,
      prompt: options.prompt,
      max_workers: options.max_workers || 4
    };

    const response = await this.sendRequest(request);

    if (response.status !== 'success') {
      throw new Error(response.error || 'Batch transcription failed');
    }

    return response;
  }

  /**
   * Ping bridge to check if alive
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.sendRequest({ command: 'ping' });
      return response.status === 'success';
    } catch {
      return false;
    }
  }

  /**
   * Preload model
   * Returns quantization info if available
   */
  async loadModel(modelName: string): Promise<MlxResponse> {
    const response = await this.sendRequest({
      command: 'load_model',
      model: modelName
    });

    if (response.status !== 'success') {
      throw new Error(response.error || 'Failed to load model');
    }

    return response;
  }

  /**
   * Check if bridge is ready
   */
  isInitialized(): boolean {
    return this.isReady;
  }

  /**
   * Dispose of bridge process
   */
  async dispose(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      // Send quit command
      if (this.isReady) {
        await this.sendRequest({ command: 'quit' });
      }

      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.warn('Error during MLX bridge shutdown:', error);
    } finally {
      // Force kill if still alive
      if (this.process && !this.process.killed) {
        this.process.kill('SIGTERM');
      }

      this.reader?.close();
      this.process = undefined;
      this.reader = undefined;
      this.isReady = false;
      this.currentRequest = undefined;
      this.requestQueue = [];
    }
  }
}
