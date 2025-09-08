import { AudioSegmenter } from '../src/audioSegmenter';
import { SegmentOptions } from '../src/types';
import { writeFileSync, unlinkSync, existsSync, readFileSync, statSync } from 'fs';

// Mock modules
const mockExecAsync = jest.fn();

jest.mock('child_process', () => ({
  exec: jest.fn()
}));

jest.mock('util', () => ({
  promisify: () => mockExecAsync
}));

jest.mock('fs');

const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
const mockUnlinkSync = unlinkSync as jest.MockedFunction<typeof unlinkSync>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;

describe('AudioSegmenter', () => {
  let segmenter: AudioSegmenter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecAsync.mockClear();
    
    segmenter = new AudioSegmenter();
    
    // Mock fs.existsSync for temp directory
    mockExistsSync.mockReturnValue(true);
    
    // Mock fs.statSync for file sizes
    mockStatSync.mockReturnValue({ size: 10 * 1024 * 1024 } as any); // 10MB default
  });

  describe('FFmpeg Integration', () => {
    test('should detect FFmpeg availability', async () => {
      // Mock successful FFmpeg version check
      mockExecAsync.mockResolvedValue({ stdout: 'ffmpeg version 4.4.0', stderr: '' });

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 85,
        silenceThresholdDb: -35,
        minSilenceMs: 400
      };

      const audioBuffer = Buffer.from('mock audio data');
      
      // This should not throw since FFmpeg is available
      await expect(async () => {
        await segmenter.segmentAudio(audioBuffer, options);
      }).not.toThrow();
    });

    test('should use fallback when FFmpeg is not available', async () => {
      // Mock FFmpeg not available
      mockExecAsync.mockRejectedValue(new Error('ffmpeg: command not found'));

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 85
      };

      const audioBuffer = Buffer.from('mock audio data');

      // Should fall back to simple segmentation instead of throwing
      const result = await segmenter.segmentAudio(audioBuffer, options);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Audio Metadata Extraction', () => {
    test('should extract audio duration and metadata', async () => {
      // Mock audio metadata extraction
      const metadataStderr = `
        Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'input.m4a':
        Duration: 00:03:45.67, start: 0.000000, bitrate: 128 kb/s
        Stream #0:0(und): Audio: aac (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s
      `;

      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'ffmpeg version 4.4.0', stderr: '' }) // FFmpeg version check
        .mockResolvedValueOnce({ stdout: '', stderr: metadataStderr }); // Metadata extraction

      // Mock file size to be small enough (no segmentation needed)
      mockStatSync.mockReturnValue({ size: 5 * 1024 * 1024 } as any); // 5MB
      mockReadFileSync.mockReturnValue(Buffer.from('mock audio data'));

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 300 // 5 minutes, longer than test audio
      };

      const audioBuffer = Buffer.from('mock audio data');
      const result = await segmenter.segmentAudio(audioBuffer, options);

      expect(result).toHaveLength(1);
      expect(result[0].startSec).toBe(0);
      expect(result[0].endSec).toBe(225.67); // 3:45.67 in seconds
    });
  });

  describe('Silence Detection', () => {
    test('should detect silence intervals using silencedetect filter', async () => {
      // Mock audio metadata
      const metadataStderr = 'Duration: 00:05:00.00, bitrate: 128 kb/s\nStream #0:0: Audio: aac, 44100 Hz, stereo';
      
      // Mock silence detection output
      const silenceStderr = `
        [silencedetect @ 0x7f8b8c000000] silence_start: 30.5
        [silencedetect @ 0x7f8b8c000000] silence_end: 32.1 | silence_duration: 1.6
        [silencedetect @ 0x7f8b8c000000] silence_start: 120.8
        [silencedetect @ 0x7f8b8c000000] silence_end: 123.4 | silence_duration: 2.6
      `;

      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'ffmpeg version 4.4.0', stderr: '' }) // FFmpeg version check
        .mockResolvedValueOnce({ stdout: '', stderr: metadataStderr }) // Metadata extraction
        .mockResolvedValueOnce({ stdout: '', stderr: silenceStderr }) // Silence detection
        .mockResolvedValue({ stdout: '', stderr: '' }); // Segment extraction

      // Mock large file to trigger segmentation
      mockStatSync.mockReturnValue({ size: 30 * 1024 * 1024 } as any); // 30MB

      mockReadFileSync.mockReturnValue(Buffer.from('mock segment data'));

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 60, // 1 minute chunks
        silenceThresholdDb: -35,
        minSilenceMs: 400
      };

      const audioBuffer = Buffer.from('mock long audio data');
      const result = await segmenter.segmentAudio(audioBuffer, options);

      // Should create segments based on silence detection
      expect(result.length).toBeGreaterThan(1);
      
      // First segment should start at 0
      expect(result[0].startSec).toBe(0);
      
      // Segments should be in chronological order
      for (let i = 1; i < result.length; i++) {
        expect(result[i].startSec).toBeGreaterThan(result[i-1].startSec);
        expect(result[i].startSec).toBe(result[i-1].endSec);
      }
    });

    test('should use hard splits when no suitable silence found', async () => {
      // Mock FFmpeg version check
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, 'ffmpeg version 4.4.0', '');
        return {} as any;
      });

      // Mock audio metadata - 10 minute audio
      const metadataStderr = 'Duration: 00:10:00.00, bitrate: 128 kb/s\nStream #0:0: Audio: aac, 44100 Hz, stereo';
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, '', metadataStderr);
        return {} as any;
      });

      // Mock no silence detected
      const silenceStderr = ''; // No silence intervals
      mockExec.mockImplementationOnce((command, callback) => {
        if (command.includes('silencedetect') && callback) {
          callback(null, '', silenceStderr);
        }
        return {} as any;
      });

      // Mock large file to trigger segmentation
      mockStatSync.mockReturnValue({ size: 50 * 1024 * 1024 } as any); // 50MB

      // Mock segment extraction
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('-ss') && callback) {
          callback(null, '', '');
        }
        return {} as any;
      });

      mockReadFileSync.mockReturnValue(Buffer.from('mock segment data'));

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 180, // 3 minutes
        hardSplitWindowSec: 60, // Force split every 60 seconds if needed
        silenceThresholdDb: -35,
        minSilenceMs: 400
      };

      const audioBuffer = Buffer.from('mock long audio data');
      const result = await segmenter.segmentAudio(audioBuffer, options);

      // Should create multiple segments using hard splits
      expect(result.length).toBeGreaterThan(1);
      
      // Each segment should be around 60 seconds or less
      for (const segment of result) {
        const duration = segment.endSec - segment.startSec;
        expect(duration).toBeLessThanOrEqual(180); // Max chunk duration
      }
    });
  });

  describe('Audio Segment Creation', () => {
    test('should create audio segments using FFmpeg with correct parameters', async () => {
      // Mock FFmpeg version check
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, 'ffmpeg version 4.4.0', '');
        return {} as any;
      });

      // Mock audio metadata
      const metadataStderr = 'Duration: 00:03:00.00, bitrate: 128 kb/s\nStream #0:0: Audio: aac, 44100 Hz, stereo';
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, '', metadataStderr);
        return {} as any;
      });

      // Mock silence detection - split at 90 seconds
      const silenceStderr = `
        [silencedetect @ 0x7f8b8c000000] silence_start: 89.5
        [silencedetect @ 0x7f8b8c000000] silence_end: 90.5 | silence_duration: 1.0
      `;
      mockExec.mockImplementationOnce((command, callback) => {
        if (command.includes('silencedetect') && callback) {
          callback(null, '', silenceStderr);
        }
        return {} as any;
      });

      // Mock large file
      mockStatSync.mockReturnValue({ size: 30 * 1024 * 1024 } as any);

      // Track FFmpeg segment extraction calls
      const segmentCalls: string[] = [];
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('-ss') && command.includes('-t')) {
          segmentCalls.push(command);
          if (callback) callback(null, '', '');
        }
        return {} as any;
      });

      mockReadFileSync.mockReturnValue(Buffer.from('mock segment data'));

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 120, // 2 minutes
        silenceThresholdDb: -35,
        minSilenceMs: 400
      };

      const audioBuffer = Buffer.from('mock audio data');
      await segmenter.segmentAudio(audioBuffer, options);

      // Should have called FFmpeg to create segments
      expect(segmentCalls.length).toBeGreaterThan(0);
      
      // Each call should have correct FFmpeg parameters
      for (const call of segmentCalls) {
        expect(call).toContain('-ss'); // Start time
        expect(call).toContain('-t');  // Duration
        expect(call).toContain('-c copy'); // Copy codec (no re-encoding)
        expect(call).toContain('-avoid_negative_ts make_zero'); // Fix timestamps
      }
    });

    test('should preserve intermediate files when requested', async () => {
      // Mock FFmpeg version check
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, 'ffmpeg version 4.4.0', '');
        return {} as any;
      });

      // Mock small audio file (no segmentation needed)
      const metadataStderr = 'Duration: 00:01:00.00, bitrate: 128 kb/s\nStream #0:0: Audio: aac, 44100 Hz, stereo';
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, '', metadataStderr);
        return {} as any;
      });

      mockStatSync.mockReturnValue({ size: 5 * 1024 * 1024 } as any); // 5MB
      mockReadFileSync.mockReturnValue(Buffer.from('mock audio data'));

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 120,
        preserveIntermediates: true
      };

      const audioBuffer = Buffer.from('mock audio data');
      const result = await segmenter.segmentAudio(audioBuffer, options);

      // Should return buffer since no segmentation needed
      expect(result).toHaveLength(1);
      expect(Buffer.isBuffer(result[0].bufferOrPath)).toBe(true);
    });

    test('should cleanup temporary files when not preserving intermediates', async () => {
      // Mock FFmpeg version check
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, 'ffmpeg version 4.4.0', '');
        return {} as any;
      });

      // Mock audio metadata
      const metadataStderr = 'Duration: 00:02:00.00, bitrate: 128 kb/s\nStream #0:0: Audio: aac, 44100 Hz, stereo';
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, '', metadataStderr);
        return {} as any;
      });

      // Mock silence detection
      const silenceStderr = `
        [silencedetect @ 0x7f8b8c000000] silence_start: 59.5
        [silencedetect @ 0x7f8b8c000000] silence_end: 60.5 | silence_duration: 1.0
      `;
      mockExec.mockImplementationOnce((command, callback) => {
        if (command.includes('silencedetect') && callback) {
          callback(null, '', silenceStderr);
        }
        return {} as any;
      });

      // Mock large file to trigger segmentation
      mockStatSync.mockReturnValue({ size: 30 * 1024 * 1024 } as any);

      // Mock segment extraction
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('-ss') && callback) {
          callback(null, '', '');
        }
        return {} as any;
      });

      mockReadFileSync.mockReturnValue(Buffer.from('mock segment data'));

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 90,
        preserveIntermediates: false // Should cleanup
      };

      const audioBuffer = Buffer.from('mock audio data');
      await segmenter.segmentAudio(audioBuffer, options);

      // Should have called unlinkSync to cleanup temp files
      expect(mockUnlinkSync).toHaveBeenCalled();
    });
  });

  describe('Fallback Segmentation', () => {
    test('should fall back to simple segmentation when FFmpeg is unavailable', async () => {
      // Mock FFmpeg not available
      mockExecAsync.mockRejectedValue(new Error('ffmpeg: command not found'));

      // Mock large file that needs segmentation
      mockStatSync.mockReturnValue({ size: 50 * 1024 * 1024 } as any); // 50MB

      const options: SegmentOptions = {
        maxUploadSizeMB: 20, // Force segmentation
        maxChunkDurationSec: 300,
        hardSplitWindowSec: 60
      };

      const audioBuffer = Buffer.from('mock large audio data');
      const result = await segmenter.segmentAudio(audioBuffer, options);

      // Should create multiple segments based on size
      expect(result.length).toBeGreaterThan(1);
      
      // Each segment should be within size constraints
      for (const segment of result) {
        expect(segment.sizeBytes).toBeLessThanOrEqual(20 * 1024 * 1024);
        expect(Buffer.isBuffer(segment.bufferOrPath)).toBe(true);
      }

      // Timeline should be continuous
      for (let i = 1; i < result.length; i++) {
        expect(result[i].startSec).toBe(result[i-1].endSec);
      }
    });

    test('should return single segment when file is small enough in fallback mode', async () => {
      // Mock FFmpeg not available
      mockExecAsync.mockRejectedValue(new Error('ffmpeg: command not found'));

      // Mock small file
      mockStatSync.mockReturnValue({ size: 15 * 1024 * 1024 } as any); // 15MB

      const options: SegmentOptions = {
        maxUploadSizeMB: 20
      };

      const audioBuffer = Buffer.from('mock small audio data');
      const result = await segmenter.segmentAudio(audioBuffer, options);

      // Should return single segment
      expect(result).toHaveLength(1);
      expect(result[0].startSec).toBe(0);
      expect(result[0].sizeBytes).toBe(15 * 1024 * 1024);
      expect(Buffer.isBuffer(result[0].bufferOrPath)).toBe(true);
    });

    test('should handle File input in fallback mode', async () => {
      // Mock FFmpeg not available
      mockExecAsync.mockRejectedValue(new Error('ffmpeg: command not found'));

      const mockFileData = new Uint8Array(30 * 1024 * 1024); // 30MB
      const mockFile = {
        size: mockFileData.length,
        arrayBuffer: jest.fn().mockResolvedValue(mockFileData.buffer),
        name: 'test-audio.m4a'
      } as unknown as File;

      const options: SegmentOptions = {
        maxUploadSizeMB: 20
      };

      const result = await segmenter.segmentAudio(mockFile, options);

      // Should create multiple segments
      expect(result.length).toBeGreaterThan(1);
      expect(mockFile.arrayBuffer).toHaveBeenCalled();
    });

    test('should handle string file path in fallback mode', async () => {
      // Mock FFmpeg not available
      mockExecAsync.mockRejectedValue(new Error('ffmpeg: command not found'));

      // Mock file stats and read operations
      mockStatSync.mockReturnValue({ size: 40 * 1024 * 1024 } as any);
      const mockFileData = Buffer.alloc(40 * 1024 * 1024);
      mockReadFileSync.mockReturnValue(mockFileData);

      const options: SegmentOptions = {
        maxUploadSizeMB: 25
      };

      const filePath = '/path/to/audio.m4a';
      const result = await segmenter.segmentAudio(filePath, options);

      // Should create multiple segments
      expect(result.length).toBeGreaterThan(1);
      expect(mockStatSync).toHaveBeenCalledWith(filePath);
      expect(mockReadFileSync).toHaveBeenCalledWith(filePath);
    });

    test('should calculate segments based on both size and duration constraints in fallback', async () => {
      // Mock FFmpeg not available
      mockExecAsync.mockRejectedValue(new Error('ffmpeg: command not found'));

      // Mock very large file
      mockStatSync.mockReturnValue({ size: 100 * 1024 * 1024 } as any); // 100MB

      const options: SegmentOptions = {
        maxUploadSizeMB: 20,
        maxChunkDurationSec: 120, // 2 minutes
        hardSplitWindowSec: 60 // 1 minute hard split
      };

      const audioBuffer = Buffer.from('mock very large audio data');
      const result = await segmenter.segmentAudio(audioBuffer, options);

      // Should create enough segments to satisfy all constraints
      const expectedSegmentsBySize = Math.ceil(100 / 20); // 5 segments by size
      const estimatedDurationSec = (100 * 60); // ~100 minutes estimated
      const expectedSegmentsByDuration = Math.ceil(estimatedDurationSec / 120); // by max duration
      const expectedSegmentsByHardSplit = Math.ceil(estimatedDurationSec / 60); // by hard split

      const expectedSegments = Math.max(expectedSegmentsBySize, expectedSegmentsByDuration, expectedSegmentsByHardSplit);
      
      expect(result.length).toBeGreaterThanOrEqual(expectedSegmentsBySize);
      
      // Each segment should respect size constraints
      for (const segment of result) {
        expect(segment.sizeBytes).toBeLessThanOrEqual(20 * 1024 * 1024);
      }
    });

    test('should handle errors gracefully in fallback mode', async () => {
      // Mock FFmpeg not available
      mockExecAsync.mockRejectedValue(new Error('ffmpeg: command not found'));

      // Mock file stat error
      mockStatSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const options: SegmentOptions = {
        maxUploadSizeMB: 20
      };

      const filePath = '/nonexistent/file.m4a';
      const result = await segmenter.segmentAudio(filePath, options);

      // Should use default fallback size and still work
      expect(result.length).toBeGreaterThan(0);
      
      // Should have logged a warning about file size
      // (We can't directly test console.warn, but the code should handle the error)
    });

    test('should provide accurate duration estimates in fallback segments', async () => {
      // Mock FFmpeg not available
      mockExecAsync.mockRejectedValue(new Error('ffmpeg: command not found'));

      // Mock 60MB file (~60 minutes estimated at 1MB/min)
      mockStatSync.mockReturnValue({ size: 60 * 1024 * 1024 } as any);

      const options: SegmentOptions = {
        maxUploadSizeMB: 20,
        maxChunkDurationSec: 600 // 10 minutes
      };

      const audioBuffer = Buffer.from('mock audio data');
      const result = await segmenter.segmentAudio(audioBuffer, options);

      // Should create 3 segments (60MB / 20MB each)
      expect(result.length).toBe(3);
      
      // Each segment should have reasonable duration estimate
      const totalEstimatedDuration = 60 * 60; // 60 minutes
      const expectedDurationPerSegment = totalEstimatedDuration / 3;
      
      for (const segment of result) {
        const segmentDuration = segment.endSec - segment.startSec;
        expect(segmentDuration).toBeCloseTo(expectedDurationPerSegment, 1);
      }
      
      // Last segment should end at total estimated duration
      expect(result[result.length - 1].endSec).toBeCloseTo(totalEstimatedDuration, 1);
    });
  });

  describe('Error Handling', () => {
    test('should handle FFmpeg errors gracefully', async () => {
      // Mock FFmpeg version check success
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, 'ffmpeg version 4.4.0', '');
        return {} as any;
      });

      // Mock metadata extraction failure
      mockExec.mockImplementationOnce((command, callback) => {
        if (command.includes('-f null') && callback) {
          callback(new Error('Invalid file format'), '', 'Error reading file');
        }
        return {} as any;
      });

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 120
      };

      const audioBuffer = Buffer.from('corrupted audio data');

      await expect(segmenter.segmentAudio(audioBuffer, options))
        .rejects.toThrow();
    });

    test('should handle segment extraction failures', async () => {
      // Mock FFmpeg version check
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, 'ffmpeg version 4.4.0', '');
        return {} as any;
      });

      // Mock audio metadata
      const metadataStderr = 'Duration: 00:02:00.00, bitrate: 128 kb/s\nStream #0:0: Audio: aac, 44100 Hz, stereo';
      mockExec.mockImplementationOnce((command, callback) => {
        if (callback) callback(null, '', metadataStderr);
        return {} as any;
      });

      // Mock silence detection
      const silenceStderr = '';
      mockExec.mockImplementationOnce((command, callback) => {
        if (command.includes('silencedetect') && callback) {
          callback(null, '', silenceStderr);
        }
        return {} as any;
      });

      // Mock large file
      mockStatSync.mockReturnValue({ size: 30 * 1024 * 1024 } as any);

      // Mock segment extraction failure
      mockExec.mockImplementation((command, callback) => {
        if (command.includes('-ss') && callback) {
          callback(new Error('Segment extraction failed'), '', 'FFmpeg error');
        }
        return {} as any;
      });

      const options: SegmentOptions = {
        maxUploadSizeMB: 25,
        maxChunkDurationSec: 60
      };

      const audioBuffer = Buffer.from('mock audio data');

      await expect(segmenter.segmentAudio(audioBuffer, options))
        .rejects.toThrow('Segment extraction failed');
    });
  });
});