import { AudioProcessor } from '../src/audioProcessor';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';

// Mock child_process and fs modules
jest.mock('child_process');
jest.mock('fs');

const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
const mockUnlinkSync = unlinkSync as jest.MockedFunction<typeof unlinkSync>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

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
    audioProcessor = new AudioProcessor();
  });

  describe('processAudioSpeed', () => {
    test('should return original file when speed multiplier is 1', async () => {
      const result = await audioProcessor.processAudioSpeed(mockAudioFile, 1);
      
      expect(result).toBe(mockAudioFile);
      expect(mockExec).not.toHaveBeenCalled();
    });

    test('should process audio with ffmpeg when speed multiplier > 1', async () => {
      const processedData = Buffer.from('processed audio data');
      
      // Mock fs operations
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(processedData);
      
      // Mock successful ffmpeg execution for both version check and processing
      mockExec.mockImplementation((command, callback) => {
        if (callback) {
          callback(null, 'success', '');
        }
        return {} as any;
      });

      const result = await audioProcessor.processAudioSpeed(mockAudioFile, 2);

      // Should have been called for version check and actual processing
      expect(mockExec).toHaveBeenCalledTimes(2);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('ffmpeg'),
        expect.any(Function)
      );
      expect(result).toHaveProperty('name');
      expect(result.name).toContain('processed_test.m4a');
      expect(result).toHaveProperty('type', 'audio/m4a');
    });

    test('should handle ffmpeg execution errors', async () => {
      // Mock ffmpeg not available (no successful version check)
      mockExec.mockImplementation((command, callback) => {
        if (callback) {
          callback(new Error('ffmpeg failed'), '', 'error output');
        }
        return {} as any;
      });

      await expect(audioProcessor.processAudioSpeed(mockAudioFile, 2))
        .rejects.toThrow('FFmpeg is not available on this system');
    });

    test('should clean up temp files after processing', async () => {
      const processedData = Buffer.from('processed audio data');
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(processedData);
      
      // Mock successful ffmpeg execution for both version check and processing
      mockExec.mockImplementation((command, callback) => {
        if (callback) {
          callback(null, 'success', '');
        }
        return {} as any;
      });

      await audioProcessor.processAudioSpeed(mockAudioFile, 2);

      expect(mockUnlinkSync).toHaveBeenCalledTimes(2); // input and output files
    });
  });

  describe('checkFFmpegAvailability', () => {
    test('should return true when ffmpeg is available', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (callback) {
          callback(null, 'ffmpeg version 4.4.0', '');
        }
        return {} as any;
      });

      const result = await audioProcessor.checkFFmpegAvailability();
      
      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('"ffmpeg" -version', expect.any(Function));
    });

    test('should return false when ffmpeg is not available', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (callback) {
          callback(new Error('command not found'), '', 'ffmpeg: command not found');
        }
        return {} as any;
      });

      const result = await audioProcessor.checkFFmpegAvailability();
      
      expect(result).toBe(false);
    });
  });
});