import { createSttProvider, createSummarizationProvider } from '../src/providers/providerFactory';
import { SttSettings, SummarySettings, VerboseTranscriptionResult } from '../src/types';
import { OpenAiSttProvider } from '../src/providers/OpenAiSttProvider';
import { OpenAiSummarizationProvider } from '../src/providers/OpenAiSummarizationProvider';

// Mock fetch for testing
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock child_process for local whisper binary testing
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn(),
}));

describe('Provider Factory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSttProvider', () => {
    test('should create OpenAI provider when provider is openai', () => {
      const settings: SttSettings = {
        provider: 'openai',
        model: 'whisper-1',
        apiKey: 'test-key',
        language: 'en'
      };

      const provider = createSttProvider(settings);
      expect(provider).toBeInstanceOf(OpenAiSttProvider);
    });

    test('should create Gemini provider when provider is gemini', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        apiKey: 'test-key',
        language: 'en'
      };

      const provider = createSttProvider(settings);
      // For now, this will be a stub/mock implementation
      expect(provider).toBeDefined();
      expect(provider.transcribe).toBeDefined();
    });

    test('should create Local Whisper provider when provider is local-whisper', () => {
      const settings: SttSettings = {
        provider: 'local-whisper',
        model: 'whisper-tiny',
        ollamaEndpoint: 'http://localhost:11434',
        language: 'en'
      };

      const provider = createSttProvider(settings);
      expect(provider).toBeDefined();
      expect(provider.transcribe).toBeDefined();
    });

    test('should throw error for unknown provider', () => {
      const settings = {
        provider: 'unknown',
        model: 'test-model'
      } as any;

      expect(() => createSttProvider(settings)).toThrow('Unknown STT provider: unknown');
    });
  });

  describe('createSummarizationProvider', () => {
    test('should create OpenAI provider when provider is openai', () => {
      const settings: SummarySettings = {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key'
      };

      const provider = createSummarizationProvider(settings);
      expect(provider).toBeInstanceOf(OpenAiSummarizationProvider);
    });

    test('should create Gemini provider when provider is gemini', () => {
      const settings: SummarySettings = {
        provider: 'gemini',
        model: 'gemini-1.5-pro',
        apiKey: 'test-key'
      };

      const provider = createSummarizationProvider(settings);
      expect(provider).toBeDefined();
      expect(provider.summarize).toBeDefined();
    });

    test('should create Local LLM provider when provider is local-llm', () => {
      const settings: SummarySettings = {
        provider: 'local-llm',
        model: 'llama3.1',
        ollamaEndpoint: 'http://localhost:11434'
      };

      const provider = createSummarizationProvider(settings);
      expect(provider).toBeDefined();
      expect(provider.summarize).toBeDefined();
    });

    test('should throw error for unknown provider', () => {
      const settings = {
        provider: 'unknown',
        model: 'test-model'
      } as any;

      expect(() => createSummarizationProvider(settings)).toThrow('Unknown summarization provider: unknown');
    });
  });
});

describe('OpenAI STT Provider', () => {
  let provider: OpenAiSttProvider;
  
  beforeEach(() => {
    const settings: SttSettings = {
      provider: 'openai',
      model: 'whisper-1',
      apiKey: 'test-key',
      language: 'en'
    };
    provider = new OpenAiSttProvider(settings);
  });

  test('should call OpenAI API with verbose_json format', async () => {
    const mockResponse: VerboseTranscriptionResult = {
      text: 'Hello world',
      language: 'en',
      duration: 5.0,
      segments: [
        {
          id: 0,
          start: 0.0,
          end: 5.0,
          text: 'Hello world',
          words: [
            { start: 0.0, end: 2.5, word: 'Hello' },
            { start: 2.5, end: 5.0, word: 'world' }
          ]
        }
      ],
      raw: { /* original API response */ }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const audioBuffer = new ArrayBuffer(8);
    const result = await provider.transcribe(audioBuffer, { 
      format: 'verbose_json', 
      language: 'en' 
    });

    expect(result.text).toBe(mockResponse.text);
    expect(result.language).toBe(mockResponse.language);
    expect(result.duration).toBe(mockResponse.duration);
    expect(result.segments).toEqual(mockResponse.segments);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/audio/transcriptions'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key'
        })
      })
    );
  });

  test('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    } as Response);

    const audioBuffer = new ArrayBuffer(8);
    
    await expect(provider.transcribe(audioBuffer, { format: 'verbose_json' }))
      .rejects.toThrow('OpenAI API error: 401 Unauthorized');
  });
});

describe('OpenAI Summarization Provider', () => {
  let provider: OpenAiSummarizationProvider;
  
  beforeEach(() => {
    const settings: SummarySettings = {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'test-key'
    };
    provider = new OpenAiSummarizationProvider(settings);
  });

  test('should call OpenAI chat API for summarization', async () => {
    const mockSummary = 'This is a comprehensive summary of the meeting.';
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: mockSummary
          }
        }]
      })
    } as Response);

    const input = {
      text: 'Long meeting transcript...',
      segments: [
        { id: 0, start: 0, end: 10, text: 'Introduction' },
        { id: 1, start: 10, end: 20, text: 'Main discussion' }
      ],
      language: 'en'
    };

    const result = await provider.summarize(input, { model: 'gpt-4' });

    expect(result).toBe(mockSummary);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-key'
        })
      })
    );
  });

  test('should use segments information in prompt when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Summary with segments' } }]
      })
    } as Response);

    const input = {
      text: 'Full transcript',
      segments: [
        { id: 0, start: 0, end: 300, text: 'First part of discussion' },
        { id: 1, start: 300, end: 600, text: 'Second part of discussion' }
      ],
      language: 'en'
    };

    await provider.summarize(input, { model: 'gpt-4' });

    const fetchCall = mockFetch.mock.calls[0];
    const requestBody = fetchCall[1]?.body;
    
    // Check that the request was made with proper authorization
    expect(fetchCall[1]?.headers).toMatchObject({
      'Authorization': 'Bearer test-key'
    });
    
    // Parse the JSON body and check for segment information
    if (typeof requestBody === 'string') {
      const parsedBody = JSON.parse(requestBody);
      expect(parsedBody.messages[1].content).toContain('시간별 구간 정보');
      expect(parsedBody.messages[1].content).toContain('0:00-0:10');
    }
  });
});