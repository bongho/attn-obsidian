import * as fs from 'fs';
import * as path from 'path';
import { Logger, LogContext } from '../src/logger';
import { LoggingSettings } from '../src/types';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Logger', () => {
  let mockSettings: LoggingSettings;
  let logger: Logger;
  let mockLogDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogDir = '/test/logs';
    mockSettings = {
      enabled: true,
      level: 'error',
      logFilePath: `${mockLogDir}/ATTN-error.log`,
      maxLogFileBytes: 5 * 1024 * 1024, // 5MB
      maxLogFiles: 5
    };

    // Mock fs.existsSync and fs.mkdirSync
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.mkdirSync.mockReturnValue(undefined);
    mockedFs.statSync.mockReturnValue({ size: 1000 } as any);
    mockedFs.appendFileSync.mockReturnValue(undefined);
    mockedFs.readdirSync.mockReturnValue([]);
    mockedFs.renameSync.mockReturnValue(undefined);
    mockedFs.unlinkSync.mockReturnValue(undefined);

    logger = new Logger(mockSettings);
  });

  describe('constructor', () => {
    test('should initialize with settings', () => {
      expect(logger).toBeInstanceOf(Logger);
    });

    test('should create log directory if it does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);
      
      new Logger(mockSettings);
      
      expect(mockedFs.existsSync).toHaveBeenCalledWith(mockLogDir);
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(mockLogDir, { recursive: true });
    });

    test('should not create directory if it already exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      
      new Logger(mockSettings);
      
      expect(mockedFs.existsSync).toHaveBeenCalledWith(mockLogDir);
      expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('logError', () => {
    test('should log error when logging is enabled', async () => {
      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1',
        filePath: '/test/audio.m4a',
        chunkIndex: 0,
        chunkCount: 3,
        durationSec: 45.2,
        sizeBytes: 1024000
      };

      const error = new Error('Test error');
      await logger.logError(context, error);

      const logCall = mockedFs.appendFileSync.mock.calls[0][1] as string;
      const logEntry = JSON.parse(logCall.trim());
      
      expect(logEntry.level).toBe('error');
      expect(logEntry.requestId).toBe('req-123');
      expect(logEntry.errorMessage).toBe('Test error');
    });

    test('should not log when logging is disabled', async () => {
      mockSettings.enabled = false;
      logger = new Logger(mockSettings);

      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      const error = new Error('Test error');
      await logger.logError(context, error);

      expect(mockedFs.appendFileSync).not.toHaveBeenCalled();
    });

    test('should include error stack trace when available', async () => {
      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test';

      await logger.logError(context, error);

      const lastCall = mockedFs.appendFileSync.mock.calls[mockedFs.appendFileSync.mock.calls.length - 1];
      const loggedContent = lastCall[1] as string;
      const loggedData = JSON.parse(loggedContent.trim());
      
      expect(loggedData.stack).toBe('Error: Test error\n    at test');
      expect(loggedData.errorMessage).toBe('Test error');
    });

    test('should handle non-Error objects', async () => {
      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      await logger.logError(context, 'String error');

      const lastCall = mockedFs.appendFileSync.mock.calls[mockedFs.appendFileSync.mock.calls.length - 1];
      const loggedContent = lastCall[1] as string;
      const loggedData = JSON.parse(loggedContent.trim());
      
      expect(loggedData.errorMessage).toBe('String error');
      expect(loggedData.errorName).toBe('Unknown');
    });

    test('should include all context fields when provided', async () => {
      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1',
        filePath: '/test/audio.m4a',
        chunkIndex: 2,
        chunkCount: 5,
        durationSec: 120.5,
        sizeBytes: 2048000,
        status: 400,
        responseBody: { error: 'File too large' },
        context: { customField: 'value' }
      };

      const error = new Error('Test error');
      await logger.logError(context, error);

      const logCall = mockedFs.appendFileSync.mock.calls[0][1] as string;
      const logEntry = JSON.parse(logCall.trim());

      expect(logEntry.requestId).toBe('req-123');
      expect(logEntry.provider).toBe('openai');
      expect(logEntry.model).toBe('whisper-1');
      expect(logEntry.filePath).toBe('/test/audio.m4a');
      expect(logEntry.chunkIndex).toBe(2);
      expect(logEntry.chunkCount).toBe(5);
      expect(logEntry.durationSec).toBe(120.5);
      expect(logEntry.sizeBytes).toBe(2048000);
      expect(logEntry.status).toBe(400);
      expect(logEntry.responseBody).toEqual({ error: 'File too large' });
      expect(logEntry.context).toEqual({ customField: 'value' });
    });
  });

  describe('log', () => {
    test('should log info message when level is info or lower', async () => {
      mockSettings.level = 'info';
      logger = new Logger(mockSettings);

      await logger.log('info', { message: 'Test info', data: { key: 'value' } });

      const lastCall = mockedFs.appendFileSync.mock.calls[mockedFs.appendFileSync.mock.calls.length - 1];
      const loggedContent = lastCall[1] as string;
      const loggedData = JSON.parse(loggedContent.trim());
      
      expect(loggedData.level).toBe('info');
      expect(loggedData.message).toBe('Test info');
      expect(loggedData.data).toEqual({ key: 'value' });
    });

    test('should not log debug message when level is error', async () => {
      mockSettings.level = 'error';
      logger = new Logger(mockSettings);

      await logger.log('debug', { message: 'Debug info' });

      expect(mockedFs.appendFileSync).not.toHaveBeenCalled();
    });

    test('should respect log level hierarchy', async () => {
      const testCases = [
        { settingLevel: 'error', logLevel: 'error', shouldLog: true },
        { settingLevel: 'error', logLevel: 'warn', shouldLog: false },
        { settingLevel: 'warn', logLevel: 'error', shouldLog: true },
        { settingLevel: 'warn', logLevel: 'warn', shouldLog: true },
        { settingLevel: 'warn', logLevel: 'info', shouldLog: false },
        { settingLevel: 'info', logLevel: 'debug', shouldLog: false },
        { settingLevel: 'debug', logLevel: 'info', shouldLog: true },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        mockSettings.level = testCase.settingLevel as any;
        logger = new Logger(mockSettings);

        await logger.log(testCase.logLevel as any, { message: 'test' });

        if (testCase.shouldLog) {
          expect(mockedFs.appendFileSync).toHaveBeenCalled();
        } else {
          expect(mockedFs.appendFileSync).not.toHaveBeenCalled();
        }
      }
    });
  });

  describe('file rotation', () => {
    test('should rotate log file when size exceeds maxLogFileBytes', async () => {
      // Mock file size to exceed limit
      mockedFs.statSync.mockReturnValue({ size: 6 * 1024 * 1024 } as any); // 6MB

      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      await logger.logError(context, new Error('Test'));

      // Should call rotation logic
      expect(mockedFs.renameSync).toHaveBeenCalled();
    });

    test('should keep only maxLogFiles number of log files', async () => {
      // Mock file size to exceed limit
      mockedFs.statSync.mockReturnValue({ size: 6 * 1024 * 1024 } as any);
      
      // Mock existing log files
      mockedFs.readdirSync.mockReturnValue([
        'ATTN-error.log.1',
        'ATTN-error.log.2',
        'ATTN-error.log.3',
        'ATTN-error.log.4',
        'ATTN-error.log.5',
        'other-file.txt'
      ] as any);

      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      await logger.logError(context, new Error('Test'));

      // Should remove the oldest file
      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(
        path.join(mockLogDir, 'ATTN-error.log.5')
      );
    });

    test('should not rotate if file size is within limit', async () => {
      // Mock file size within limit
      mockedFs.statSync.mockReturnValue({ size: 3 * 1024 * 1024 } as any); // 3MB

      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      await logger.logError(context, new Error('Test'));

      // Should not rotate
      expect(mockedFs.renameSync).not.toHaveBeenCalled();
    });

    test('should handle missing log file gracefully during rotation', async () => {
      // Mock statSync to throw error (file doesn't exist)
      mockedFs.statSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      await expect(logger.logError(context, new Error('Test')))
        .resolves.not.toThrow();

      // Should still attempt to log
      expect(mockedFs.appendFileSync).toHaveBeenCalled();
    });
  });

  describe('JSON Lines format', () => {
    test('should write each log entry as a separate JSON line', async () => {
      const context1: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      const context2: LogContext = {
        requestId: 'req-456',
        provider: 'gemini',
        model: 'gemini-1.5-flash'
      };

      await logger.logError(context1, new Error('Error 1'));
      await logger.logError(context2, new Error('Error 2'));

      expect(mockedFs.appendFileSync).toHaveBeenCalledTimes(2);

      const firstCall = mockedFs.appendFileSync.mock.calls[0][1] as string;
      const secondCall = mockedFs.appendFileSync.mock.calls[1][1] as string;

      // Each call should end with a newline
      expect(firstCall.endsWith('\n')).toBe(true);
      expect(secondCall.endsWith('\n')).toBe(true);

      // Each call should be valid JSON
      expect(() => JSON.parse(firstCall.trim())).not.toThrow();
      expect(() => JSON.parse(secondCall.trim())).not.toThrow();

      const firstEntry = JSON.parse(firstCall.trim());
      const secondEntry = JSON.parse(secondCall.trim());

      expect(firstEntry.requestId).toBe('req-123');
      expect(secondEntry.requestId).toBe('req-456');
    });

    test('should include timestamp in ISO format', async () => {
      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1'
      };

      await logger.logError(context, new Error('Test'));

      const logCall = mockedFs.appendFileSync.mock.calls[0][1] as string;
      const logEntry = JSON.parse(logCall.trim());

      expect(logEntry.timestamp).toBeDefined();
      expect(new Date(logEntry.timestamp).toISOString()).toBe(logEntry.timestamp);
    });

    test('should handle special characters in JSON properly', async () => {
      const context: LogContext = {
        requestId: 'req-123',
        provider: 'openai',
        model: 'whisper-1',
        filePath: '/path/with\nnewlines\tand"quotes'
      };

      const error = new Error('Error with "quotes" and \n newlines');

      await logger.logError(context, error);

      const logCall = mockedFs.appendFileSync.mock.calls[0][1] as string;
      
      // Should be valid JSON despite special characters
      expect(() => JSON.parse(logCall.trim())).not.toThrow();

      const logEntry = JSON.parse(logCall.trim());
      expect(logEntry.filePath).toBe('/path/with\nnewlines\tand"quotes');
      expect(logEntry.errorMessage).toBe('Error with "quotes" and \n newlines');
    });
  });

  describe('concurrent access safety', () => {
    test('should handle multiple simultaneous log calls without corruption', async () => {
      const contexts = Array.from({ length: 10 }, (_, i) => ({
        requestId: `req-${i}`,
        provider: 'openai',
        model: 'whisper-1'
      }));

      // Simulate concurrent logging
      const promises = contexts.map((context, i) =>
        logger.logError(context, new Error(`Error ${i}`))
      );

      await Promise.all(promises);

      // All log calls should have been made
      expect(mockedFs.appendFileSync).toHaveBeenCalledTimes(10);

      // Each call should be for the same file
      mockedFs.appendFileSync.mock.calls.forEach(call => {
        expect(call[0]).toBe(mockSettings.logFilePath);
      });
    });
  });
});