import { AudioProcessor } from '../src/audioProcessor';
import { AudioSegmenter, SegmentResult } from '../src/audioSegmenter';
import { Logger, LogContext } from '../src/logger';
import { VerboseTranscriptionResult, ATTNSettings } from '../src/types';
import { ApiService } from '../src/apiService';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';

// Mock modules
const mockExecAsync = jest.fn();

jest.mock('child_process', () => ({
  exec: jest.fn()
}));

jest.mock('util', () => ({
  promisify: () => mockExecAsync
}));

jest.mock('fs');
jest.mock('../src/audioSegmenter');
jest.mock('../src/logger');
jest.mock('../src/apiService');
jest.mock('uuid', () => ({
  v4: () => 'test-uuid-1234'
}));
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
const mockUnlinkSync = unlinkSync as jest.MockedFunction<typeof unlinkSync>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

const mockAudioSegmenter = AudioSegmenter as jest.MockedClass<typeof AudioSegmenter>;
const mockLogger = Logger as jest.MockedClass<typeof Logger>;
const mockApiService = ApiService as jest.MockedClass<typeof ApiService>;

describe('AudioProcessor', () => {
  let audioProcessor: AudioProcessor;
  
  // Mock File with arrayBuffer method
  const mockAudioFile = {
    name: 'test.m4a',
    type: 'audio/m4a',
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8))
  } as any as File;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecAsync.mockClear();
    audioProcessor = new AudioProcessor();
  });

  describe('processAudioSpeed', () => {
    test('should return original file when speed multiplier is 1', async () => {
      const result = await audioProcessor.processAudioSpeed(mockAudioFile, 1);
      
      expect(result).toBe(mockAudioFile);
      expect(mockExecAsync).not.toHaveBeenCalled();
    });

    test('should process audio with ffmpeg when speed multiplier > 1', async () => {
      const processedData = Buffer.from('processed audio data');
      
      // Mock fs operations
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(processedData);
      
      // Mock successful ffmpeg execution
      mockExecAsync.mockResolvedValue({ stdout: 'success', stderr: '' });

      const result = await audioProcessor.processAudioSpeed(mockAudioFile, 2);

      // Should have been called for version check and actual processing
      expect(mockExecAsync).toHaveBeenCalledTimes(2);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('ffmpeg')
      );
      expect(result).toHaveProperty('name');
      expect(result.name).toContain('processed_test.m4a');
      expect(result).toHaveProperty('type', 'audio/m4a');
    });

    test('should handle ffmpeg execution errors', async () => {
      // Mock ffmpeg not available (no successful version check)
      mockExecAsync.mockRejectedValue(new Error('ffmpeg failed'));

      await expect(audioProcessor.processAudioSpeed(mockAudioFile, 2))
        .rejects.toThrow('FFmpeg is not available on this system');
    });

    test('should clean up temp files after processing', async () => {
      const processedData = Buffer.from('processed audio data');
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(processedData);
      
      // Mock successful ffmpeg execution
      mockExecAsync.mockResolvedValue({ stdout: 'success', stderr: '' });

      await audioProcessor.processAudioSpeed(mockAudioFile, 2);

      expect(mockUnlinkSync).toHaveBeenCalledTimes(2); // input and output files
    });
  });

  describe('checkFFmpegAvailability', () => {
    test('should return true when ffmpeg is available', async () => {
      mockExecAsync.mockResolvedValue({ stdout: 'ffmpeg version 4.4.0', stderr: '' });

      const result = await audioProcessor.checkFFmpegAvailability();
      
      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('"ffmpeg" -version');
    });

    test('should return false when ffmpeg is not available', async () => {
      mockExecAsync.mockRejectedValue(new Error('command not found'));

      const result = await audioProcessor.checkFFmpegAvailability();
      
      expect(result).toBe(false);
    });
  });

  describe('custom ffmpeg path', () => {
    test('should use custom ffmpeg path when provided', async () => {
      const customPath = '/custom/path/to/ffmpeg';
      const customAudioProcessor = new AudioProcessor(customPath);

      mockExecAsync.mockImplementation((command) => {
        if (command.includes(customPath)) {
          return Promise.resolve({ stdout: 'ffmpeg version 4.4.0', stderr: '' });
        } else {
          return Promise.reject(new Error('command not found'));
        }
      });

      const result = await customAudioProcessor.checkFFmpegAvailability();
      
      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(`"${customPath}" -version`);
    });

    test('should fall back to system paths when custom path fails', async () => {
      const customPath = '/invalid/path/to/ffmpeg';
      const customAudioProcessor = new AudioProcessor(customPath);

      mockExecAsync.mockImplementation((command) => {
        if (command.includes(customPath)) {
          return Promise.reject(new Error('file not found'));
        } else if (command.includes('"ffmpeg"')) {
          return Promise.resolve({ stdout: 'ffmpeg version 4.4.0', stderr: '' });
        } else {
          return Promise.reject(new Error('command not found'));
        }
      });

      const result = await customAudioProcessor.checkFFmpegAvailability();
      
      expect(result).toBe(true);
      // Should have tried custom path first, then fallen back to system paths
      expect(mockExecAsync).toHaveBeenCalledWith(`"${customPath}" -version`);
      expect(mockExecAsync).toHaveBeenCalledWith('"ffmpeg" -version');
    });
  });

  describe('audio chunking and STT retry', () => {
    let mockSettings: ATTNSettings;
    let mockSegmenterInstance: jest.Mocked<AudioSegmenter>;
    let mockLoggerInstance: jest.Mocked<Logger>;
    let mockApiServiceInstance: jest.Mocked<ApiService>;

    beforeEach(() => {
      mockSettings = {
        processing: {
          enableChunking: true,
          maxUploadSizeMB: 24.5,
          maxChunkDurationSec: 85,
          targetSampleRateHz: 16000,
          targetChannels: 1,
          silenceThresholdDb: -35,
          minSilenceMs: 400,
          hardSplitWindowSec: 30,
          preserveIntermediates: false
        },
        logging: {
          enabled: true,
          level: 'error',
          maxLogFileBytes: 5 * 1024 * 1024,
          maxLogFiles: 5
        }
      } as ATTNSettings;

      // Mock segmenter instance
      mockSegmenterInstance = {
        segmentAudio: jest.fn(),
      } as any;
      mockAudioSegmenter.mockImplementation(() => mockSegmenterInstance);

      // Mock logger instance
      mockLoggerInstance = {
        logError: jest.fn(),
        log: jest.fn(),
      } as any;
      mockLogger.mockImplementation(() => mockLoggerInstance);

      // Mock API service instance
      mockApiServiceInstance = {
        transcribeAudio: jest.fn(),
      } as any;
      mockApiService.mockImplementation(() => mockApiServiceInstance);

      audioProcessor = new AudioProcessor();
    });

    test('should detect oversized audio file and trigger chunking', async () => {
      const largeAudioFile = {
        name: 'large-audio.m4a',
        type: 'audio/m4a',
        size: 30 * 1024 * 1024, // 30MB - exceeds 24.5MB limit
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(30 * 1024 * 1024))
      } as any as File;

      const mockSegments: SegmentResult[] = [
        { bufferOrPath: Buffer.from('chunk1'), startSec: 0, endSec: 40, sizeBytes: 10 * 1024 * 1024 },
        { bufferOrPath: Buffer.from('chunk2'), startSec: 40, endSec: 80, sizeBytes: 10 * 1024 * 1024 },
        { bufferOrPath: Buffer.from('chunk3'), startSec: 80, endSec: 120, sizeBytes: 10 * 1024 * 1024 }
      ];

      mockSegmenterInstance.segmentAudio.mockResolvedValue(mockSegments);

      const mockChunkResults: VerboseTranscriptionResult[] = [
        {
          text: 'First chunk transcript',
          segments: [{ id: 0, start: 0, end: 40, text: 'First chunk transcript' }]
        },
        {
          text: 'Second chunk transcript', 
          segments: [{ id: 1, start: 0, end: 40, text: 'Second chunk transcript' }]
        },
        {
          text: 'Third chunk transcript',
          segments: [{ id: 2, start: 0, end: 40, text: 'Third chunk transcript' }]
        }
      ];

      mockApiServiceInstance.transcribeAudio.mockImplementation((audio, options) => {
        const chunkIndex = mockChunkResults.findIndex((_, i) => !mockChunkResults[i]._used);
        mockChunkResults[chunkIndex]._used = true;
        return Promise.resolve(mockChunkResults[chunkIndex]);
      });

      const result = await audioProcessor.transcribeWithChunking(largeAudioFile, mockSettings);

      expect(mockSegmenterInstance.segmentAudio).toHaveBeenCalledWith(largeAudioFile, {
        maxUploadSizeMB: 24.5,
        maxChunkDurationSec: 85,
        targetSampleRateHz: 16000,
        targetChannels: 1,
        silenceThresholdDb: -35,
        minSilenceMs: 400,
        hardSplitWindowSec: 30,
        preserveIntermediates: false
      });

      expect(mockApiServiceInstance.transcribeAudio).toHaveBeenCalledTimes(3);
      
      // Should merge results with proper timeline offset
      expect(result.text).toBe('First chunk transcript Second chunk transcript Third chunk transcript');
      expect(result.segments).toHaveLength(3);
      expect(result.segments[1].start).toBe(40); // Second chunk offset by 40 seconds
      expect(result.segments[2].start).toBe(80); // Third chunk offset by 80 seconds
    });

    test('should handle 400 error from STT provider and retry with chunking', async () => {
      const audioFile = {
        name: 'audio.m4a',
        type: 'audio/m4a',
        size: 20 * 1024 * 1024, // Under size limit but will trigger 400 error
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(20 * 1024 * 1024))
      } as any as File;

      const mock400Error = new Error('File too large');
      (mock400Error as any).status = 400;
      (mock400Error as any).response = { data: { error: { message: 'File is too large' } } };

      const mockSegments: SegmentResult[] = [
        { bufferOrPath: Buffer.from('chunk1'), startSec: 0, endSec: 60, sizeBytes: 10 * 1024 * 1024 },
        { bufferOrPath: Buffer.from('chunk2'), startSec: 60, endSec: 120, sizeBytes: 10 * 1024 * 1024 }
      ];

      mockSegmenterInstance.segmentAudio.mockResolvedValue(mockSegments);

      // First call fails with 400, subsequent calls succeed
      mockApiServiceInstance.transcribeAudio
        .mockRejectedValueOnce(mock400Error)
        .mockResolvedValueOnce({
          text: 'First chunk',
          segments: [{ id: 0, start: 0, end: 60, text: 'First chunk' }]
        })
        .mockResolvedValueOnce({
          text: 'Second chunk',
          segments: [{ id: 1, start: 0, end: 60, text: 'Second chunk' }]
        });

      const result = await audioProcessor.transcribeWithRetry(audioFile, mockSettings);

      // Should have called transcribeAudio 3 times (1 failure + 2 successes)
      expect(mockApiServiceInstance.transcribeAudio).toHaveBeenCalledTimes(3);
      
      // Should have logged the 400 error
      expect(mockLoggerInstance.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.any(String),
          status: 400,
          errorMessage: 'File too large'
        }),
        mock400Error
      );

      // Should have called segmenter after 400 error
      expect(mockSegmenterInstance.segmentAudio).toHaveBeenCalled();
      
      expect(result.text).toBe('First chunk Second chunk');
    });

    test('should not retry with chunking when enableChunking is false', async () => {
      mockSettings.processing.enableChunking = false;

      const audioFile = {
        name: 'audio.m4a',
        type: 'audio/m4a', 
        size: 30 * 1024 * 1024,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(30 * 1024 * 1024))
      } as any as File;

      const mock400Error = new Error('File too large');
      (mock400Error as any).status = 400;
      (mock400Error as any).response = { data: { error: { message: 'File is too large' } } };

      mockApiServiceInstance.transcribeAudio.mockRejectedValue(mock400Error);

      await expect(audioProcessor.transcribeWithRetry(audioFile, mockSettings))
        .rejects.toThrow(/File is too large.*enable chunking in Processing settings/);

      expect(mockSegmenterInstance.segmentAudio).not.toHaveBeenCalled();
      expect(mockLoggerInstance.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          errorMessage: expect.stringContaining('enable chunking')
        }),
        expect.any(Error)
      );
    });

    test('should merge verbose_json segments with correct timeline offsets', async () => {
      const segments: SegmentResult[] = [
        { bufferOrPath: Buffer.from('chunk1'), startSec: 0, endSec: 45, sizeBytes: 5 * 1024 * 1024 },
        { bufferOrPath: Buffer.from('chunk2'), startSec: 45, endSec: 90, sizeBytes: 5 * 1024 * 1024 }
      ];

      const chunkResults: VerboseTranscriptionResult[] = [
        {
          text: 'First part of the meeting',
          language: 'en',
          duration: 45,
          segments: [
            { 
              id: 0, 
              start: 0, 
              end: 20, 
              text: 'First part',
              words: [
                { start: 0, end: 2, word: 'First' },
                { start: 3, end: 6, word: 'part' }
              ]
            },
            { 
              id: 1, 
              start: 20, 
              end: 45, 
              text: 'of the meeting',
              words: [
                { start: 20, end: 22, word: 'of' },
                { start: 23, end: 26, word: 'the' },
                { start: 27, end: 34, word: 'meeting' }
              ]
            }
          ]
        },
        {
          text: 'Second part continues here',
          language: 'en',
          duration: 45,
          segments: [
            { 
              id: 0, 
              start: 0, 
              end: 25, 
              text: 'Second part continues',
              words: [
                { start: 0, end: 4, word: 'Second' },
                { start: 5, end: 9, word: 'part' },
                { start: 10, end: 19, word: 'continues' }
              ]
            },
            { 
              id: 1, 
              start: 25, 
              end: 45, 
              text: 'here',
              words: [
                { start: 25, end: 29, word: 'here' }
              ]
            }
          ]
        }
      ];

      const merged = audioProcessor.mergeVerboseResults(chunkResults, segments);

      expect(merged.text).toBe('First part of the meeting Second part continues here');
      expect(merged.language).toBe('en');
      expect(merged.duration).toBe(90); // Combined duration
      
      // Check segments timeline offset
      expect(merged.segments).toHaveLength(4);
      expect(merged.segments[0].start).toBe(0);
      expect(merged.segments[0].end).toBe(20);
      expect(merged.segments[1].start).toBe(20);
      expect(merged.segments[1].end).toBe(45);
      expect(merged.segments[2].start).toBe(45); // Second chunk starts at 45 seconds
      expect(merged.segments[2].end).toBe(70); // 25 + 45 offset
      expect(merged.segments[3].start).toBe(70); // 25 + 45 offset
      expect(merged.segments[3].end).toBe(90); // 45 + 45 offset

      // Check words timeline offset
      expect(merged.segments[2].words![0].start).toBe(45); // 0 + 45 offset
      expect(merged.segments[2].words![0].end).toBe(49); // 4 + 45 offset
      expect(merged.segments[3].words![0].start).toBe(70); // 25 + 45 offset
      expect(merged.segments[3].words![0].end).toBe(74); // 29 + 45 offset
    });

    test('should handle network retry with exponential backoff for 5xx errors', async () => {
      const audioFile = {
        name: 'audio.m4a',
        type: 'audio/m4a',
        size: 10 * 1024 * 1024,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(10 * 1024 * 1024))
      } as any as File;

      const network502Error = new Error('Bad Gateway');
      (network502Error as any).status = 502;

      const successResult = {
        text: 'Success after retries',
        segments: [{ id: 0, start: 0, end: 30, text: 'Success after retries' }]
      };

      // Fail twice with 502, then succeed
      mockApiServiceInstance.transcribeAudio
        .mockRejectedValueOnce(network502Error)
        .mockRejectedValueOnce(network502Error)
        .mockResolvedValueOnce(successResult);

      const startTime = Date.now();
      const result = await audioProcessor.transcribeWithRetry(audioFile, mockSettings);
      const elapsedTime = Date.now() - startTime;

      expect(mockApiServiceInstance.transcribeAudio).toHaveBeenCalledTimes(3);
      expect(result).toEqual(successResult);
      
      // Should have waited for exponential backoff (500ms + 1000ms = 1500ms minimum)
      expect(elapsedTime).toBeGreaterThan(1400);

      // Should log retry attempts  
      expect(mockLoggerInstance.log).toHaveBeenCalledWith('warn', 
        expect.objectContaining({
          message: expect.stringContaining('retry'),
          attempt: expect.any(Number),
          status: 502
        })
      );
    });

    test('should preserve verbose_json raw data in chunks format', async () => {
      const segments: SegmentResult[] = [
        { bufferOrPath: Buffer.from('chunk1'), startSec: 0, endSec: 30, sizeBytes: 5 * 1024 * 1024 }
      ];

      const chunkResults: VerboseTranscriptionResult[] = [
        {
          text: 'Test transcript',
          segments: [{ id: 0, start: 0, end: 30, text: 'Test transcript' }],
          raw: { original: 'openai-response-data' }
        }
      ];

      const merged = audioProcessor.mergeVerboseResults(chunkResults, segments);

      expect(merged.raw).toEqual({
        chunks: [{ original: 'openai-response-data' }]
      });
    });

    test('should handle ECONNRESET and timeout errors with retry', async () => {
      const audioFile = {
        name: 'audio.m4a',
        type: 'audio/m4a',
        size: 5 * 1024 * 1024,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(5 * 1024 * 1024))
      } as any as File;

      const econnresetError = new Error('ECONNRESET');
      (econnresetError as any).code = 'ECONNRESET';

      const successResult = {
        text: 'Success after connection reset',
        segments: [{ id: 0, start: 0, end: 30, text: 'Success after connection reset' }]
      };

      mockApiServiceInstance.transcribeAudio
        .mockRejectedValueOnce(econnresetError)
        .mockResolvedValueOnce(successResult);

      const result = await audioProcessor.transcribeWithRetry(audioFile, mockSettings);

      expect(mockApiServiceInstance.transcribeAudio).toHaveBeenCalledTimes(2);
      expect(result).toEqual(successResult);
      
      expect(mockLoggerInstance.log).toHaveBeenCalledWith('warn', 
        expect.objectContaining({
          message: expect.stringContaining('Network error, retrying'),
          errorCode: 'ECONNRESET'
        })
      );
    });

    test('should fail after maximum retry attempts', async () => {
      const audioFile = {
        name: 'audio.m4a',
        type: 'audio/m4a',
        size: 5 * 1024 * 1024,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(5 * 1024 * 1024))
      } as any as File;

      const persistentError = new Error('Service unavailable');
      (persistentError as any).status = 503;

      mockApiServiceInstance.transcribeAudio.mockRejectedValue(persistentError);

      await expect(audioProcessor.transcribeWithRetry(audioFile, mockSettings))
        .rejects.toThrow('Service unavailable');

      // Should have tried 3 times (initial + 2 retries)
      expect(mockApiServiceInstance.transcribeAudio).toHaveBeenCalledTimes(3);

      // Should log final failure
      expect(mockLoggerInstance.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 503,
          errorMessage: 'Service unavailable'
        }),
        persistentError
      );
    });

    test('should validate that all segments have consistent audio metadata', async () => {
      const audioFile = {
        name: 'audio.m4a',
        type: 'audio/m4a',
        size: 25 * 1024 * 1024, 
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(25 * 1024 * 1024))
      } as any as File;

      const inconsistentSegments: SegmentResult[] = [
        { bufferOrPath: Buffer.from('chunk1'), startSec: 0, endSec: 30, sizeBytes: 12 * 1024 * 1024 },
        { bufferOrPath: Buffer.from('chunk2'), startSec: 40, endSec: 70, sizeBytes: 13 * 1024 * 1024 } // Gap at 30-40
      ];

      mockSegmenterInstance.segmentAudio.mockResolvedValue(inconsistentSegments);

      await expect(audioProcessor.transcribeWithChunking(audioFile, mockSettings))
        .rejects.toThrow(/Timeline gap detected/);

      expect(mockLoggerInstance.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: expect.stringContaining('Timeline validation failed')
        }),
        expect.any(Error)
      );
    });
  });
});