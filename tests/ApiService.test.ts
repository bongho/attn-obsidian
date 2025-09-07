import { ApiService } from '../src/apiService';
import { ATTNSettings } from '../src/types';

// Mock providers
jest.mock('../src/providers/providerFactory', () => ({
  createSttProvider: jest.fn(),
  createSummarizationProvider: jest.fn(),
}));

// Mock ConfigLoader
jest.mock('../src/configLoader', () => ({
  ConfigLoader: {
    getInstance: jest.fn().mockReturnValue({
      getOpenAIApiKey: jest.fn().mockReturnValue(null),
      isDebugMode: jest.fn().mockReturnValue(false),
      getOpenAISettings: jest.fn().mockReturnValue({ language: 'ko' }),
    }),
  },
}));

import { createSttProvider, createSummarizationProvider } from '../src/providers/providerFactory';

describe('ApiService', () => {
  let apiService: ApiService;
  let mockSttProvider: any;
  let mockSummaryProvider: any;
  let testSettings: ATTNSettings;

  beforeEach(() => {
    jest.clearAllMocks();
    
    testSettings = {
      openaiApiKey: 'legacy-key',
      saveFolderPath: '/',
      noteFilenameTemplate: '',
      noteContentTemplate: '',
      noteContentTemplateFile: '',
      useTemplateFile: false,
      systemPrompt: 'Test prompt',
      audioSpeedMultiplier: 1,
      ffmpegPath: '',
      stt: {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'stt-key',
        language: 'ko'
      },
      summary: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'summary-key'
      }
    };

    mockSttProvider = {
      transcribe: jest.fn(),
    };

    mockSummaryProvider = {
      summarize: jest.fn(),
    };

    (createSttProvider as jest.Mock).mockReturnValue(mockSttProvider);
    (createSummarizationProvider as jest.Mock).mockReturnValue(mockSummaryProvider);

    apiService = new ApiService(testSettings);
  });

  describe('constructor', () => {
    test('should initialize with settings', () => {
      expect(apiService).toBeInstanceOf(ApiService);
      // Constructor should not throw and should set up properly
    });
  });

  describe('processAudioFile', () => {
    const mockAudioFile = {
      name: 'test.m4a',
      type: 'audio/m4a',
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
    } as File;
    const mockVerboseResult = {
      text: 'This is the transcribed text from the audio file.',
      segments: [
        { id: 0, start: 0, end: 5, text: 'This is the transcribed text' },
        { id: 1, start: 5, end: 10, text: 'from the audio file.' }
      ],
      language: 'en',
      duration: 10
    };
    const mockSummaryText = 'This is a summary of the meeting content.';

    beforeEach(() => {
      // Mock STT provider response
      mockSttProvider.transcribe.mockResolvedValue(mockVerboseResult);

      // Mock Summary provider response  
      mockSummaryProvider.summarize.mockResolvedValue(mockSummaryText);
    });

    test('should call STT provider for transcription', async () => {
      await apiService.processAudioFile(mockAudioFile);

      expect(createSttProvider).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'stt-key',
        language: 'ko'
      }));
      expect(mockSttProvider.transcribe).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        {
          format: 'verbose_json',
          language: 'ko',
          model: 'whisper-1'
        }
      );
    });

    test('should call Summary provider for summarization', async () => {
      await apiService.processAudioFile(mockAudioFile);

      expect(createSummarizationProvider).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'summary-key'
      }));
      expect(mockSummaryProvider.summarize).toHaveBeenCalledWith(
        {
          text: mockVerboseResult.text,
          segments: mockVerboseResult.segments,
          language: mockVerboseResult.language
        },
        {
          model: 'gpt-4'
        }
      );
    });

    test('should return transcript, summary and verbose result', async () => {
      const result = await apiService.processAudioFile(mockAudioFile);

      expect(result).toEqual({
        transcript: mockVerboseResult.text,
        summary: mockSummaryText,
        verboseResult: mockVerboseResult
      });
    });

    test('should handle STT provider errors', async () => {
      const errorMessage = 'STT provider error';
      mockSttProvider.transcribe.mockRejectedValue(new Error(errorMessage));

      await expect(apiService.processAudioFile(mockAudioFile))
        .rejects.toThrow(`음성 인식 실패: ${errorMessage}`);
    });

    test('should handle Summary provider errors', async () => {
      const errorMessage = 'Summary provider error';
      mockSummaryProvider.summarize.mockRejectedValue(new Error(errorMessage));

      await expect(apiService.processAudioFile(mockAudioFile))
        .rejects.toThrow(`요약 생성 실패: ${errorMessage}`);
    });

    test('should handle empty transcription response', async () => {
      mockSttProvider.transcribe.mockResolvedValue({
        text: '',
        segments: []
      });

      await expect(apiService.processAudioFile(mockAudioFile))
        .rejects.toThrow('음성 인식 결과가 비어있습니다.');
    });

    test('should handle empty summary response', async () => {
      mockSummaryProvider.summarize.mockResolvedValue('');

      await expect(apiService.processAudioFile(mockAudioFile))
        .rejects.toThrow('요약 결과가 비어있습니다.');
    });

    test('should process transcription and summary sequentially', async () => {
      await apiService.processAudioFile(mockAudioFile);

      // Verify both providers were called
      expect(mockSttProvider.transcribe).toHaveBeenCalled();
      expect(mockSummaryProvider.summarize).toHaveBeenCalled();
      
      // Verify transcription was called first by checking call times
      const transcriptionCallTime = mockSttProvider.transcribe.mock.invocationCallOrder[0];
      const summaryCallTime = mockSummaryProvider.summarize.mock.invocationCallOrder[0];
      expect(transcriptionCallTime).toBeLessThan(summaryCallTime);
    });
  });

  describe('settings handling', () => {
    test('should use legacy API key when provider keys are missing', () => {
      const settingsWithoutProviderKeys = {
        ...testSettings,
        stt: { ...testSettings.stt, apiKey: undefined },
        summary: { ...testSettings.summary, apiKey: undefined }
      };

      const service = new ApiService(settingsWithoutProviderKeys);
      expect(service).toBeInstanceOf(ApiService);
      // Constructor should not throw even with missing provider API keys
    });
  });
});