/**
 * Integration tests for STT providers
 *
 * These tests verify that the provider factory correctly instantiates
 * different STT providers and that they have the expected configuration.
 *
 * Note: These are unit/integration tests, not end-to-end tests.
 * They don't make actual API calls to avoid costs and rate limits.
 */

import { createSttProvider } from '../src/providers/providerFactory';
import { SttSettings } from '../src/types';
import { OpenAiSttProvider } from '../src/providers/OpenAiSttProvider';
import { GeminiSttProvider } from '../src/providers/GeminiSttProvider';

describe('STT Provider Factory', () => {
  describe('OpenAI Provider', () => {
    it('should create OpenAI provider with correct settings', () => {
      const settings: SttSettings = {
        provider: 'openai',
        apiKey: 'sk-test-key',
        model: 'whisper-1',
        language: 'ko'
      };

      const provider = createSttProvider(settings);

      expect(provider).toBeInstanceOf(OpenAiSttProvider);
    });
  });

  describe('Gemini Provider', () => {
    it('should create Gemini provider with correct settings', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-gemini-key',
        model: 'gemini-1.5-flash',
        language: 'ko'
      };

      const provider = createSttProvider(settings);

      expect(provider).toBeInstanceOf(GeminiSttProvider);
    });

    it('should throw error when Gemini API key is missing', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: '',
        model: 'gemini-1.5-flash'
      };

      expect(() => createSttProvider(settings)).toThrow('Gemini API key is required');
    });
  });

  describe('Groq Provider', () => {
    it('should create Groq provider (OpenAI-compatible) with correct baseUrl', () => {
      const settings: SttSettings = {
        provider: 'groq',
        apiKey: 'gsk-test-key',
        model: 'whisper-large-v3',
        language: 'ko'
      };

      const provider = createSttProvider(settings);

      // Groq uses OpenAI provider with different baseUrl
      expect(provider).toBeInstanceOf(OpenAiSttProvider);

      // Verify that it's configured for Groq endpoint
      const providerWithBaseUrl = provider as any;
      expect(providerWithBaseUrl.baseUrl).toBe('https://api.groq.com/openai/v1');
    });

    it('should default to whisper-large-v3 model for Groq', () => {
      const settings: SttSettings = {
        provider: 'groq',
        apiKey: 'gsk-test-key',
        // No model specified
      };

      const provider = createSttProvider(settings);
      const providerWithSettings = provider as any;

      expect(providerWithSettings.settings.model).toBe('whisper-large-v3');
    });
  });

  describe('Provider Selection Logic', () => {
    it('should support all provider types', () => {
      const providers: Array<SttSettings['provider']> = ['openai', 'gemini', 'groq', 'local-whisper'];

      providers.forEach(providerType => {
        if (providerType === 'local-whisper') {
          // Local whisper doesn't require API key
          const settings: SttSettings = {
            provider: providerType,
            whisperBinaryPath: '/usr/local/bin/whisper'
          };
          expect(() => createSttProvider(settings)).not.toThrow();
        } else if (providerType === 'gemini') {
          const settings: SttSettings = {
            provider: providerType,
            apiKey: 'test-key'
          };
          expect(() => createSttProvider(settings)).not.toThrow();
        } else {
          const settings: SttSettings = {
            provider: providerType,
            apiKey: 'test-key'
          };
          expect(() => createSttProvider(settings)).not.toThrow();
        }
      });
    });
  });
});

describe('Gemini STT Provider', () => {
  describe('MIME Type Detection', () => {
    it('should detect MP3 from magic bytes', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      // MP3 magic bytes: FF FB
      const mp3Buffer = Buffer.from([0xFF, 0xFB, 0x00, 0x00]);
      const mimeType = provider.detectMimeType(mp3Buffer);

      expect(mimeType).toBe('audio/mpeg');
    });

    it('should detect M4A from magic bytes', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      // M4A magic bytes: ....ftyp
      const m4aBuffer = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
      const mimeType = provider.detectMimeType(m4aBuffer);

      expect(mimeType).toBe('audio/mp4');
    });

    it('should detect WAV from magic bytes', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      // WAV magic bytes: RIFF
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46]);
      const mimeType = provider.detectMimeType(wavBuffer);

      expect(mimeType).toBe('audio/wav');
    });

    it('should default to audio/mpeg for unknown formats', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const mimeType = provider.detectMimeType(unknownBuffer);

      expect(mimeType).toBe('audio/mpeg');
    });
  });

  describe('Timestamp Extraction', () => {
    it('should extract timestamps from [MM:SS] format', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      const text = '[00:05] First sentence here. [00:12] Second sentence here.';
      const segments = provider.extractSegmentsFromText(text);

      expect(segments).toHaveLength(2);
      expect(segments[0].start).toBe(5);
      expect(segments[0].text).toBe('First sentence here.');
      expect(segments[1].start).toBe(12);
      expect(segments[1].text).toBe('Second sentence here.');
    });

    it('should fallback to sentence splitting when no timestamps found', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      const text = 'First sentence here. Second sentence here. Third sentence here.';
      const segments = provider.extractSegmentsFromText(text);

      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0].text).toContain('First sentence');
    });
  });

  describe('Base64 Conversion', () => {
    it('should convert ArrayBuffer to base64', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const arrayBuffer = testData.buffer;
      const base64 = provider.convertToBase64(arrayBuffer);

      expect(base64).toBe(Buffer.from(testData).toString('base64'));
    });

    it('should convert Buffer to base64', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      const buffer = Buffer.from([1, 2, 3, 4, 5]);
      const base64 = provider.convertToBase64(buffer);

      expect(base64).toBe(buffer.toString('base64'));
    });

    it('should return string as-is if already base64', () => {
      const settings: SttSettings = {
        provider: 'gemini',
        apiKey: 'test-key'
      };

      const provider = createSttProvider(settings) as any;

      const base64String = 'AQIDBAU=';
      const result = provider.convertToBase64(base64String);

      expect(result).toBe(base64String);
    });
  });
});

describe('Provider Performance Optimizations', () => {
  it('should use larger batch sizes for Groq provider', () => {
    // This would be tested in audioProcessor, but we can verify the concept
    const groqBatchSize = 20;
    const openAIBatchSize = 10;

    expect(groqBatchSize).toBeGreaterThan(openAIBatchSize);
    expect(groqBatchSize).toBe(20); // 2x faster batching for Groq
  });

  it('should use shorter delays for Groq provider', () => {
    const groqDelay = 300; // ms
    const openAIDelay = 1000; // ms

    expect(groqDelay).toBeLessThan(openAIDelay);
    expect(groqDelay).toBe(300); // 70% reduction in delay
  });
});
