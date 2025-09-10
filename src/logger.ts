import * as fs from 'fs';
import * as path from 'path';
import { LoggingSettings, LogContext } from './types';

export type { LogContext } from './types';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  'error': 0,
  'warn': 1,
  'info': 2,
  'debug': 3
};

export class Logger {
  private settings: LoggingSettings;

  static getLogDirectory(): string {
    // Use OS-specific temp directory with ATTN subdirectory
    const os = require('os');
    return path.join(os.tmpdir(), 'attn-logs');
  }

  static getDefaultLogPath(): string {
    const logDir = Logger.getLogDirectory();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(logDir, `attn-${today}.log`);
  }

  static createLogger(settings?: Partial<LoggingSettings>): Logger {
    const defaultSettings: LoggingSettings = {
      enabled: true,
      level: 'info',
      logFilePath: Logger.getDefaultLogPath(),
      maxLogFileBytes: 50 * 1024 * 1024, // 50MB in bytes
      maxLogFiles: 7
    };
    
    return new Logger({ ...defaultSettings, ...settings });
  }

  constructor(settings: LoggingSettings) {
    this.settings = settings;
    
    // Ensure log directory exists if logging is enabled
    if (this.settings.enabled && this.settings.logFilePath) {
      const logDir = path.dirname(this.settings.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  async logError(context: LogContext, err: unknown): Promise<void> {
    if (!this.settings.enabled) {
      return;
    }

    const errorName = err instanceof Error ? err.constructor.name : 'Unknown';
    const errorMessage = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      requestId: context.requestId,
      provider: context.provider,
      model: context.model,
      filePath: context.filePath || null,
      chunkIndex: context.chunkIndex ?? null,
      chunkCount: context.chunkCount ?? null,
      durationSec: context.durationSec || null,
      sizeBytes: context.sizeBytes || null,
      status: context.status || null,
      errorName,
      errorMessage,
      stack: stack || null,
      responseBody: context.responseBody || null,
      context: context.context || null
    };

    await this.writeLogEntry(logEntry);
  }

  async log(level: LogLevel, payload: Record<string, unknown>): Promise<void> {
    if (!this.settings.enabled) {
      return;
    }

    // Check if this level should be logged based on configured level
    if (LOG_LEVELS[level] > LOG_LEVELS[this.settings.level]) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      ...payload
    };

    await this.writeLogEntry(logEntry);
  }

  private async writeLogEntry(entry: Record<string, unknown>): Promise<void> {
    if (!this.settings.logFilePath) {
      // Console logging as fallback
      const timestamp = new Date().toLocaleTimeString();
      const level = (entry.level as string || 'INFO').toUpperCase();
      const message = entry.errorMessage || entry.message || JSON.stringify(entry);
      console.log(`[${timestamp}] ${level}: ${message}`);
      return;
    }

    try {
      // Ensure directory exists before writing
      const logDir = path.dirname(this.settings.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
      }
      
      // Check if rotation is needed
      await this.rotateLogIfNeeded();

      // Write JSON Lines format (one JSON object per line)
      const jsonLine = JSON.stringify(entry) + '\n';
      
      fs.appendFileSync(this.settings.logFilePath, jsonLine, { encoding: 'utf-8', mode: 0o644 });
    } catch (error) {
      // Fallback to console logging
      console.warn(`📝 ATTN Logger: Failed to write log entry to ${this.settings.logFilePath}:`, error);
      const timestamp = new Date().toLocaleTimeString();
      const level = (entry.level as string || 'INFO').toUpperCase();
      const message = entry.errorMessage || entry.message || JSON.stringify(entry);
      console.log(`[${timestamp}] ${level}: ${message}`);
    }
  }

  private async rotateLogIfNeeded(): Promise<void> {
    if (!this.settings.logFilePath || !this.settings.maxLogFileBytes) {
      return;
    }

    try {
      const stats = fs.statSync(this.settings.logFilePath);
      if (stats.size >= this.settings.maxLogFileBytes) {
        await this.rotateLogFiles();
      }
    } catch (error) {
      // File doesn't exist yet, no need to rotate
    }
  }

  private async rotateLogFiles(): Promise<void> {
    if (!this.settings.logFilePath || !this.settings.maxLogFiles) {
      return;
    }

    const logDir = path.dirname(this.settings.logFilePath);
    const logBaseName = path.basename(this.settings.logFilePath);
    const maxFiles = this.settings.maxLogFiles;

    try {
      // Get existing rotated log files
      const files = fs.readdirSync(logDir);
      const rotatedFiles = files
        .filter(file => file.startsWith(logBaseName + '.'))
        .map(file => {
          const match = file.match(new RegExp(`^${logBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`));
          return match ? { file, index: parseInt(match[1]) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (b?.index || 0) - (a?.index || 0)); // Sort in descending order

      // Shift existing files (in reverse order to avoid conflicts)
      for (const fileInfo of rotatedFiles) {
        if (fileInfo && fileInfo.index < maxFiles) {
          const oldPath = path.join(logDir, fileInfo.file);
          const newPath = path.join(logDir, `${logBaseName}.${fileInfo.index + 1}`);
          fs.renameSync(oldPath, newPath);
        }
      }

      // Remove files beyond the limit (after shifting)
      const filesToCheck = fs.readdirSync(logDir);
      for (const file of filesToCheck) {
        const match = file.match(new RegExp(`^${logBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`));
        if (match) {
          const index = parseInt(match[1]);
          if (index >= maxFiles) {
            fs.unlinkSync(path.join(logDir, file));
          }
        }
      }

      // Move current log file to .1
      const rotatedPath = path.join(logDir, `${logBaseName}.1`);
      fs.renameSync(this.settings.logFilePath, rotatedPath);

    } catch (error) {
      // Rotation failed, continue with logging
      console.warn('Logger: Log rotation failed:', error);
    }
  }
}