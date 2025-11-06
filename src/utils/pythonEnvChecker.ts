/**
 * Python Environment Checker for MLX Whisper
 *
 * Verifies Python installation and mlx-whisper package availability
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { platform, arch } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export interface PythonEnvStatus {
  pythonAvailable: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  mlxWhisperAvailable: boolean;
  mlxWhisperVersion?: string;
  applesilicon: boolean;
  platform: string;
  issues: string[];
  recommendations: string[];
}

export class PythonEnvChecker {
  private static instance: PythonEnvChecker;
  private cachedStatus?: PythonEnvStatus;

  private constructor() {}

  static getInstance(): PythonEnvChecker {
    if (!PythonEnvChecker.instance) {
      PythonEnvChecker.instance = new PythonEnvChecker();
    }
    return PythonEnvChecker.instance;
  }

  /**
   * Check complete Python environment
   */
  async checkEnvironment(): Promise<PythonEnvStatus> {
    // Return cached result if available (valid for 5 minutes)
    if (this.cachedStatus) {
      return this.cachedStatus;
    }

    const status: PythonEnvStatus = {
      pythonAvailable: false,
      mlxWhisperAvailable: false,
      applesilicon: this.isAppleSilicon(),
      platform: platform(),
      issues: [],
      recommendations: []
    };

    // Check Python
    const pythonCheck = await this.checkPython();
    status.pythonAvailable = pythonCheck.available;
    status.pythonVersion = pythonCheck.version;
    status.pythonPath = pythonCheck.path;

    if (!status.pythonAvailable) {
      status.issues.push('Python 3.9+ not found');
      status.recommendations.push('Install Python from https://www.python.org/downloads/');
      this.cachedStatus = status;
      return status;
    }

    // Check MLX Whisper (use pythonPath from previous check)
    const mlxCheck = await this.checkMlxWhisper(status.pythonPath);
    status.mlxWhisperAvailable = mlxCheck.available;
    status.mlxWhisperVersion = mlxCheck.version;

    if (!status.mlxWhisperAvailable) {
      status.issues.push('mlx-whisper package not installed');
      if (status.applesilicon) {
        status.recommendations.push('Run: pip install mlx-whisper');
      } else {
        status.issues.push('MLX requires Apple Silicon (M1/M2/M3)');
        status.recommendations.push('Use API-based providers instead (OpenAI, Groq, Gemini)');
      }
    }

    // Platform-specific checks
    if (!status.applesilicon) {
      status.issues.push('Apple Silicon (M1/M2/M3) required for MLX');
      status.recommendations.push('MLX is not supported on Intel Macs or non-Mac systems');
    }

    this.cachedStatus = status;
    // Clear cache after 5 minutes
    setTimeout(() => { this.cachedStatus = undefined; }, 5 * 60 * 1000);

    return status;
  }

  /**
   * Check if Python is available
   */
  private async checkPython(): Promise<{ available: boolean; version?: string; path?: string }> {
    // Try venv first (python/venv/bin/python3)
    const venvPath = join(__dirname, '../../python/venv/bin/python3');
    try {
      const { stdout } = await execAsync(`${venvPath} --version`);
      const version = stdout.trim().replace('Python ', '');

      const majorMinor = version.split('.').slice(0, 2).map(Number);
      if (majorMinor[0] >= 3 && (majorMinor[0] > 3 || majorMinor[1] >= 9)) {
        return { available: true, version, path: venvPath };
      }
    } catch {
      // Venv not available, continue to system python
    }

    // Try system python3
    try {
      const { stdout } = await execAsync('python3 --version');
      const version = stdout.trim().replace('Python ', '');

      // Get path
      const { stdout: pathOut } = await execAsync('which python3');
      const path = pathOut.trim();

      // Check version >= 3.9
      const majorMinor = version.split('.').slice(0, 2).map(Number);
      if (majorMinor[0] < 3 || (majorMinor[0] === 3 && majorMinor[1] < 9)) {
        return { available: false };
      }

      return { available: true, version, path };
    } catch (error) {
      // Try python as fallback
      try {
        const { stdout } = await execAsync('python --version');
        const version = stdout.trim().replace('Python ', '');
        const { stdout: pathOut } = await execAsync('which python');
        const path = pathOut.trim();

        const majorMinor = version.split('.').slice(0, 2).map(Number);
        if (majorMinor[0] < 3 || (majorMinor[0] === 3 && majorMinor[1] < 9)) {
          return { available: false };
        }

        return { available: true, version, path };
      } catch {
        return { available: false };
      }
    }
  }

  /**
   * Check if mlx-whisper is installed
   */
  private async checkMlxWhisper(pythonPath?: string): Promise<{ available: boolean; version?: string }> {
    const pythonCmd = pythonPath || 'python3';
    try {
      const { stdout } = await execAsync(`${pythonCmd} -c "import mlx_whisper; print(mlx_whisper.__version__)"`);
      const version = stdout.trim();
      return { available: true, version };
    } catch (error) {
      return { available: false };
    }
  }

  /**
   * Check if running on Apple Silicon
   */
  private isAppleSilicon(): boolean {
    return platform() === 'darwin' && arch() === 'arm64';
  }

  /**
   * Install mlx-whisper
   */
  async installMlxWhisper(onProgress?: (message: string) => void): Promise<boolean> {
    const status = await this.checkEnvironment();

    if (!status.pythonAvailable) {
      throw new Error('Python 3.9+ required. Please install Python first.');
    }

    if (!status.applesilicon) {
      throw new Error('MLX requires Apple Silicon (M1/M2/M3). Your system is not supported.');
    }

    try {
      onProgress?.('Installing mlx-whisper...');

      // Install mlx-whisper
      const installCommand = 'python3 -m pip install mlx-whisper --user';
      const { stdout, stderr } = await execAsync(installCommand);

      onProgress?.('Installation complete!');

      // Clear cache to force recheck
      this.cachedStatus = undefined;

      // Verify installation
      const newStatus = await this.checkEnvironment();
      return newStatus.mlxWhisperAvailable;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to install mlx-whisper: ${errorMessage}`);
    }
  }

  /**
   * Get human-readable status message
   */
  getStatusMessage(status: PythonEnvStatus): string {
    if (status.mlxWhisperAvailable) {
      return `✅ MLX Whisper ready (Python ${status.pythonVersion}, mlx-whisper ${status.mlxWhisperVersion})`;
    }

    if (!status.pythonAvailable) {
      return '❌ Python 3.9+ not found. Install Python to use local MLX.';
    }

    if (!status.applesilicon) {
      return '❌ MLX requires Apple Silicon (M1/M2/M3). Use API providers instead.';
    }

    return '⚠️ mlx-whisper not installed. Click to install.';
  }

  /**
   * Get recommended action
   */
  getRecommendedAction(status: PythonEnvStatus): 'install' | 'use-api' | 'ready' | 'install-python' {
    if (status.mlxWhisperAvailable) {
      return 'ready';
    }

    if (!status.pythonAvailable) {
      return 'install-python';
    }

    if (!status.applesilicon) {
      return 'use-api';
    }

    return 'install';
  }

  /**
   * Clear cached status
   */
  clearCache(): void {
    this.cachedStatus = undefined;
  }
}
