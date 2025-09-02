import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { AudioSpeedOption } from './types';

const execAsync = promisify(exec);

export class AudioProcessor {
  private tempDir: string;
  private ffmpegPath: string | null = null;

  constructor() {
    this.tempDir = join(process.cwd(), '.temp');
  }

  async processAudioSpeed(audioFile: File, speedMultiplier: AudioSpeedOption): Promise<File> {
    // If no speed change requested, return original file
    if (speedMultiplier === 1) {
      return audioFile;
    }

    // Get ffmpeg path first
    if (!this.ffmpegPath) {
      this.ffmpegPath = await this.getFFmpegPath();
    }

    if (!this.ffmpegPath) {
      throw new Error('FFmpeg is not available on this system');
    }

    const inputPath = join(this.tempDir, `input_${Date.now()}.m4a`);
    const outputPath = join(this.tempDir, `output_${Date.now()}.m4a`);

    try {
      // Create temp directory if it doesn't exist
      await this.ensureTempDir();

      // Write input file to temp location
      const audioData = await audioFile.arrayBuffer();
      writeFileSync(inputPath, new Uint8Array(audioData));

      // Use ffmpeg to speed up audio
      const ffmpegCommand = `"${this.ffmpegPath}" -i "${inputPath}" -filter:a "atempo=${speedMultiplier}" -c:a aac "${outputPath}"`;
      
      await execAsync(ffmpegCommand);

      // Read processed audio back
      const processedData = require('fs').readFileSync(outputPath);
      const processedFile = new File([processedData], `processed_${audioFile.name}`, { 
        type: 'audio/m4a' 
      });

      return processedFile;

    } catch (error) {
      throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Clean up temp files
      this.cleanupTempFiles([inputPath, outputPath]);
    }
  }

  private async ensureTempDir(): Promise<void> {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }
    } catch (error) {
      throw new Error(`Failed to create temp directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private cleanupTempFiles(filePaths: string[]): void {
    filePaths.forEach(filePath => {
      try {
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`Failed to cleanup temp file ${filePath}:`, error);
      }
    });
  }

  private async getFFmpegPath(): Promise<string | null> {
    const ffmpegPaths = [
      'ffmpeg', // System PATH
      '/usr/bin/ffmpeg', // Standard Linux/Unix
      '/usr/local/bin/ffmpeg', // Homebrew (older)
      '/opt/homebrew/bin/ffmpeg', // Homebrew (Apple Silicon)
      'C:\\ffmpeg\\bin\\ffmpeg.exe' // Windows
    ];

    for (const ffmpegPath of ffmpegPaths) {
      try {
        await execAsync(`"${ffmpegPath}" -version`);
        return ffmpegPath;
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  async checkFFmpegAvailability(): Promise<boolean> {
    try {
      const path = await this.getFFmpegPath();
      return path !== null;
    } catch (error) {
      return false;
    }
  }
}