import { SpeechToTextProvider, SttSettings, VerboseTranscriptionResult } from '../types';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export class LocalWhisperProvider implements SpeechToTextProvider {
  private settings: SttSettings;

  constructor(settings: SttSettings) {
    this.settings = settings;
  }

  async transcribe(
    input: ArrayBuffer | Buffer | string, 
    options: { format: 'verbose_json' | 'text'; language?: string; model?: string }
  ): Promise<VerboseTranscriptionResult> {
    if (this.settings.ollamaEndpoint) {
      return this.transcribeWithOllama(input, options);
    } else if (this.settings.whisperBinaryPath) {
      return this.transcribeWithBinary(input, options);
    } else {
      throw new Error('Local Whisper provider requires either ollamaEndpoint or whisperBinaryPath to be configured');
    }
  }

  private async transcribeWithOllama(
    input: ArrayBuffer | Buffer | string, 
    options: { format: 'verbose_json' | 'text'; language?: string; model?: string }
  ): Promise<VerboseTranscriptionResult> {
    const endpoint = this.settings.ollamaEndpoint!;
    const model = options.model || this.settings.model || 'whisper';
    
    // Convert input to base64 for API call
    let audioBase64: string;
    if (typeof input === 'string') {
      audioBase64 = input;
    } else if (input instanceof ArrayBuffer) {
      audioBase64 = Buffer.from(input).toString('base64');
    } else {
      audioBase64 = input.toString('base64');
    }

    const requestBody = {
      model: model,
      audio: audioBase64,
      format: options.format || 'verbose_json',
      language: options.language || this.settings.language
    };

    try {
      const response = await fetch(`${endpoint}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Ensure proper format for verbose_json
      if (options.format === 'verbose_json' && result.segments) {
        return {
          text: result.text,
          language: result.language,
          duration: result.duration,
          segments: result.segments,
          raw: result
        };
      } else {
        return {
          text: result.text || result,
          segments: [],
          raw: result
        };
      }
    } catch (error) {
      throw new Error(`Local Whisper (Ollama) transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async transcribeWithBinary(
    input: ArrayBuffer | Buffer | string, 
    options: { format: 'verbose_json' | 'text'; language?: string; model?: string }
  ): Promise<VerboseTranscriptionResult> {
    const binaryPath = this.settings.whisperBinaryPath!;
    
    if (!existsSync(binaryPath)) {
      throw new Error(`Whisper binary not found at: ${binaryPath}`);
    }

    // Create temporary audio file
    const tempDir = tmpdir();
    const audioPath = join(tempDir, `whisper_input_${Date.now()}.wav`);
    const outputPath = join(tempDir, `whisper_output_${Date.now()}.json`);

    try {
      // Write input to temporary file
      let audioBuffer: Buffer;
      if (typeof input === 'string') {
        audioBuffer = Buffer.from(input, 'base64');
      } else if (input instanceof ArrayBuffer) {
        audioBuffer = Buffer.from(input);
      } else {
        audioBuffer = input;
      }
      
      writeFileSync(audioPath, audioBuffer);

      // Build whisper command
      const args = [
        audioPath,
        '--model', options.model || this.settings.model || 'tiny',
        '--output_dir', tempDir,
        '--output_format', 'json',
        '--verbose', 'True'
      ];

      if (options.language || this.settings.language) {
        args.push('--language', options.language || this.settings.language!);
      }

      // Execute whisper binary
      await this.executeWhisper(binaryPath, args);

      // Read and parse output
      const outputData = JSON.parse(require('fs').readFileSync(outputPath, 'utf8'));
      
      return {
        text: outputData.text,
        language: outputData.language,
        duration: outputData.duration,
        segments: outputData.segments || [],
        raw: outputData
      };

    } finally {
      // Clean up temporary files
      if (existsSync(audioPath)) {
        unlinkSync(audioPath);
      }
      if (existsSync(outputPath)) {
        unlinkSync(outputPath);
      }
    }
  }

  private executeWhisper(binaryPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args);
      let stderr = '';

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Whisper binary failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to start whisper binary: ${error.message}`));
      });
    });
  }
}