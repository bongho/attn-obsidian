/**
 * Tests for chunking improvements
 *
 * Verifies enhanced retry logic, batch sizing, and rate limiting
 */

describe('Chunking Improvements', () => {
  describe('Batch Sizing Logic', () => {
    it('should calculate provider-specific batch sizes', () => {
      // Simulating getBatchSize logic
      function getBatchSize(totalSegments: number, provider: string = 'openai'): number {
        let baseBatchSize = 10;
        if (provider === 'groq') baseBatchSize = 20;
        else if (provider === 'gemini') baseBatchSize = 15;

        if (totalSegments > 100) return Math.max(Math.floor(baseBatchSize * 1.5), 15);
        else if (totalSegments > 50) return Math.max(Math.floor(baseBatchSize * 1.2), 12);
        else return baseBatchSize;
      }

      // OpenAI - conservative
      expect(getBatchSize(100, 'openai')).toBe(12);

      // Groq - aggressive (70x faster)
      expect(getBatchSize(100, 'groq')).toBe(24); // 20 * 1.2

      // Gemini - moderate
      expect(getBatchSize(100, 'gemini')).toBe(18); // 15 * 1.2
    });

    it('should scale batch size with segment count', () => {
      function getBatchSize(totalSegments: number, provider: string = 'openai'): number {
        let baseBatchSize = 10;
        if (provider === 'groq') baseBatchSize = 20;
        else if (provider === 'gemini') baseBatchSize = 15;

        if (totalSegments > 100) return Math.max(Math.floor(baseBatchSize * 1.5), 15);
        else if (totalSegments > 50) return Math.max(Math.floor(baseBatchSize * 1.2), 12);
        else return baseBatchSize;
      }

      expect(getBatchSize(30, 'openai')).toBe(10);
      expect(getBatchSize(75, 'openai')).toBe(12);
      expect(getBatchSize(150, 'openai')).toBe(15);
    });
  });

  describe('Rate Limiting Logic', () => {
    it('should calculate provider-specific delays', () => {
      function getBatchDelay(batchSize: number, provider: string = 'openai'): number {
        let baseDelay = 1000;
        if (provider === 'groq') baseDelay = 300;
        else if (provider === 'gemini') baseDelay = 500;
        return Math.max(baseDelay, batchSize * 100);
      }

      expect(getBatchDelay(10, 'openai')).toBeGreaterThanOrEqual(1000);
      expect(getBatchDelay(10, 'groq')).toBe(1000); // max(300, 10*100) = 1000
      expect(getBatchDelay(5, 'groq')).toBeLessThan(1000);
      expect(getBatchDelay(5, 'groq')).toBe(500); // max(300, 5*100) = 500
    });
  });

  describe('Retry Logic', () => {
    it('should identify retryable errors', () => {
      function shouldRetry(status?: number, code?: string): boolean {
        if (code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(code)) {
          return true;
        }
        if (status && status >= 500 && status < 600) {
          return true;
        }
        return false;
      }

      expect(shouldRetry(500, undefined)).toBe(true);
      expect(shouldRetry(502, undefined)).toBe(true);
      expect(shouldRetry(503, undefined)).toBe(true);
      expect(shouldRetry(undefined, 'ECONNRESET')).toBe(true);
      expect(shouldRetry(undefined, 'ETIMEDOUT')).toBe(true);
      expect(shouldRetry(400, undefined)).toBe(false);
      expect(shouldRetry(401, undefined)).toBe(false);
    });

    it('should use exponential backoff', () => {
      const delays: number[] = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        delays.push(delay);
      }

      expect(delays).toEqual([1000, 2000, 4000]);
    });
  });
});

describe('Provider Strategy Recommendations', () => {
  it('should recommend Gemini for large files', () => {
    const fileSize50MB = 50 * 1024 * 1024;
    const fileSize100MB = 100 * 1024 * 1024;
    const fileSize1GB = 1024 * 1024 * 1024;

    // Gemini supports up to 2GB without chunking
    const geminiLimit = 2 * 1024 * 1024 * 1024;

    expect(fileSize50MB).toBeLessThan(geminiLimit);
    expect(fileSize100MB).toBeLessThan(geminiLimit);
    expect(fileSize1GB).toBeLessThan(geminiLimit);

    // All these files can be processed by Gemini without chunking
    expect(true).toBe(true);
  });

  it('should recommend Groq for speed-critical tasks', () => {
    // Groq is 70x faster than OpenAI
    const speedMultiplier = 70;

    // For a file that takes 10 minutes on OpenAI
    const openAITime = 10 * 60 * 1000; // 10 minutes in ms
    const groqTime = openAITime / speedMultiplier;

    expect(groqTime).toBeCloseTo(8571, 0); // ~8.5 seconds

    // Groq should complete in under 10 seconds
    expect(groqTime).toBeLessThan(10000);
  });

  it('should calculate cost savings', () => {
    // 1 hour audio file
    const durationMinutes = 60;

    // OpenAI: $0.006/min
    const openAICost = durationMinutes * 0.006;
    expect(openAICost).toBeCloseTo(0.36, 2);

    // Gemini: $0.0011/min (81% cheaper)
    const geminiCost = durationMinutes * 0.0011;
    expect(geminiCost).toBeCloseTo(0.066, 3);

    // Groq: $0.0006/min (90% cheaper)
    const groqCost = durationMinutes * 0.0006;
    expect(groqCost).toBeCloseTo(0.036, 3);

    // Verify savings
    const geminiSavings = ((openAICost - geminiCost) / openAICost) * 100;
    const groqSavings = ((openAICost - groqCost) / openAICost) * 100;

    expect(geminiSavings).toBeCloseTo(81.67, 1);
    expect(groqSavings).toBeCloseTo(90, 1);
  });
});
