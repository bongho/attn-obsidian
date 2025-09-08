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

  describe('400 Error Handling for File Size Limits', () => {
    test('should throw error with status 400 for file too large', async () => {
      const error400Response = {
        error: {
          message: 'File is too large',
          type: 'invalid_request_error',
          param: 'file',
          code: 'file_too_large'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => error400Response
      } as Response);

      const largeAudioBuffer = new ArrayBuffer(30 * 1024 * 1024); // 30MB
      
      const error = await provider.transcribe(largeAudioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error).toBeDefined();
      expect(error.status).toBe(400);
      expect(error.message).toContain('File is too large');
      expect(error.response?.data).toEqual(error400Response);
    });

    test('should throw error with status 400 for audio too long', async () => {
      const error400Response = {
        error: {
          message: 'Audio file exceeds maximum duration limit',
          type: 'invalid_request_error',
          param: 'file',
          code: 'audio_too_long'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => error400Response
      } as Response);

      const audioBuffer = new ArrayBuffer(8);
      
      const error = await provider.transcribe(audioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error).toBeDefined();
      expect(error.status).toBe(400);
      expect(error.message).toContain('Audio file exceeds maximum duration limit');
      expect(error.response?.data).toEqual(error400Response);
    });

    test('should preserve response body in 400 error for debugging', async () => {
      const error400Response = {
        error: {
          message: 'The file size exceeds the 25MB limit',
          type: 'invalid_request_error',
          param: 'file'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => error400Response
      } as Response);

      const audioBuffer = new ArrayBuffer(8);
      
      try {
        await provider.transcribe(audioBuffer, { format: 'verbose_json' });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(400);
        expect(error.response).toBeDefined();
        expect(error.response.data).toEqual(error400Response);
        // Verify original error message is preserved
        expect(error.message).toContain('The file size exceeds the 25MB limit');
      }
    });

    test('should handle 400 error with generic message', async () => {
      const error400Response = {
        error: {
          message: 'Invalid request parameters',
          type: 'invalid_request_error'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => error400Response
      } as Response);

      const audioBuffer = new ArrayBuffer(8);
      
      const error = await provider.transcribe(audioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error.status).toBe(400);
      expect(error.message).toContain('Invalid request parameters');
    });

    test('should handle 400 error when response body cannot be parsed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => { throw new Error('Invalid JSON'); },
        text: async () => 'Invalid request - file size too large'
      } as Response);

      const audioBuffer = new ArrayBuffer(8);
      
      const error = await provider.transcribe(audioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error.status).toBe(400);
      expect(error.message).toBeDefined();
    });
  });

  describe('Network and Server Error Handling', () => {
    test('should throw error with status 502 for bad gateway', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway'
      } as Response);

      const audioBuffer = new ArrayBuffer(8);
      
      const error = await provider.transcribe(audioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error.status).toBe(502);
      expect(error.message).toContain('Bad Gateway');
    });

    test('should throw error with status 503 for service unavailable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      } as Response);

      const audioBuffer = new ArrayBuffer(8);
      
      const error = await provider.transcribe(audioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error.status).toBe(503);
      expect(error.message).toContain('Service Unavailable');
    });

    test('should throw error with status 429 for rate limit', async () => {
      const error429Response = {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => error429Response
      } as Response);

      const audioBuffer = new ArrayBuffer(8);
      
      const error = await provider.transcribe(audioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error.status).toBe(429);
      expect(error.message).toContain('Rate limit exceeded');
    });

    test('should handle ECONNRESET network error', async () => {
      const networkError = new Error('ECONNRESET');
      (networkError as any).code = 'ECONNRESET';

      mockFetch.mockRejectedValueOnce(networkError);

      const audioBuffer = new ArrayBuffer(8);
      
      const error = await provider.transcribe(audioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error.code).toBe('ECONNRESET');
      expect(error.message).toBe('ECONNRESET');
    });

    test('should handle ETIMEDOUT network error', async () => {
      const timeoutError = new Error('ETIMEDOUT');
      (timeoutError as any).code = 'ETIMEDOUT';

      mockFetch.mockRejectedValueOnce(timeoutError);

      const audioBuffer = new ArrayBuffer(8);
      
      const error = await provider.transcribe(audioBuffer, { format: 'verbose_json' })
        .catch(err => err);

      expect(error.code).toBe('ETIMEDOUT');
      expect(error.message).toBe('ETIMEDOUT');
    });
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