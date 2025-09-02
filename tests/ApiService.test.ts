import { ApiService } from '../src/apiService';
import OpenAI from 'openai';

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn(),
      },
    },
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

describe('ApiService', () => {
  let apiService: ApiService;
  let mockOpenAI: jest.Mocked<OpenAI>;
  const testApiKey = 'test-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    apiService = new ApiService(testApiKey);
    mockOpenAI = (apiService as any).openai;
  });

  describe('constructor', () => {
    test('should initialize with API key', () => {
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: testApiKey,
        dangerouslyAllowBrowser: true,
      });
      expect(apiService).toBeInstanceOf(ApiService);
    });
  });

  describe('processAudioFile', () => {
    const mockAudioFile = new File(['audio data'], 'test.m4a', { type: 'audio/m4a' });
    const mockTranscriptionText = 'This is the transcribed text from the audio file.';
    const mockSummaryText = 'This is a summary of the meeting content.';

    beforeEach(() => {
      // Mock Whisper API response
      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: mockTranscriptionText,
      } as any);

      // Mock GPT API response
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: mockSummaryText,
          },
        }],
      } as any);
    });

    test('should call Whisper API for transcription', async () => {
      await apiService.processAudioFile(mockAudioFile);

      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalledWith({
        file: mockAudioFile,
        model: 'whisper-1',
        language: 'ko',
      });
    });

    test('should call GPT API with transcribed text for summarization', async () => {
      await apiService.processAudioFile(mockAudioFile);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: '당신은 회의록 정리 전문가입니다. 주어진 회의 내용을 체계적으로 정리하여 명확하고 유용한 회의록을 작성해주세요.',
          },
          {
            role: 'user',
            content: `다음 회의 내용을 정리해주세요:\n\n${mockTranscriptionText}`,
          },
        ],
        temperature: 0.3,
      });
    });

    test('should return both transcript and summary in object format', async () => {
      const result = await apiService.processAudioFile(mockAudioFile);

      expect(result).toEqual({
        transcript: mockTranscriptionText,
        summary: mockSummaryText
      });
    });

    test('should handle Whisper API errors', async () => {
      const errorMessage = 'Whisper API error';
      mockOpenAI.audio.transcriptions.create.mockRejectedValue(new Error(errorMessage));

      await expect(apiService.processAudioFile(mockAudioFile))
        .rejects.toThrow(`음성 인식 실패: ${errorMessage}`);
    });

    test('should handle GPT API errors', async () => {
      const errorMessage = 'GPT API error';
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error(errorMessage));

      await expect(apiService.processAudioFile(mockAudioFile))
        .rejects.toThrow(`요약 생성 실패: ${errorMessage}`);
    });

    test('should handle empty transcription response', async () => {
      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: '',
      } as any);

      await expect(apiService.processAudioFile(mockAudioFile))
        .rejects.toThrow('음성 인식 결과가 비어있습니다.');
    });

    test('should handle empty GPT response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: '',
          },
        }],
      } as any);

      await expect(apiService.processAudioFile(mockAudioFile))
        .rejects.toThrow('요약 결과가 비어있습니다.');
    });

    test('should process transcription and summary sequentially', async () => {
      await apiService.processAudioFile(mockAudioFile);

      // Verify both APIs were called
      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalled();
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
      
      // Verify transcription was called first by checking call times
      const transcriptionCallTime = mockOpenAI.audio.transcriptions.create.mock.invocationCallOrder[0];
      const chatCallTime = mockOpenAI.chat.completions.create.mock.invocationCallOrder[0];
      expect(transcriptionCallTime).toBeLessThan(chatCallTime);
    });
  });

  describe('error handling', () => {
    test('should throw error for invalid API key format', () => {
      expect(() => new ApiService('')).toThrow('API 키가 필요합니다.');
    });

    test('should throw error for null API key', () => {
      expect(() => new ApiService(null as any)).toThrow('API 키가 필요합니다.');
    });
  });
});