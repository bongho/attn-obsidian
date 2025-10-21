/**
 * Security utility to sanitize error messages and prevent sensitive data leakage
 */

export class ErrorSanitizer {
  // Patterns for sensitive data that should be removed
  private static readonly SENSITIVE_PATTERNS = [
    // OpenAI API keys
    /sk-[a-zA-Z0-9]{48}/g,
    // Gemini API keys
    /AIza[a-zA-Z0-9_\-]{35}/g,
    // Bearer tokens
    /Bearer\s+[a-zA-Z0-9_\-\.]+/g,
    // Authorization headers
    /Authorization:\s*[^\s]+/gi,
    // Generic API key patterns
    /api[_-]?key[:\s=]+[a-zA-Z0-9_\-]+/gi,
    // JWT tokens
    /eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g,
    // File paths (may contain user info)
    /\/Users\/[^\s\/]+/g,
    /C:\\Users\\[^\s\\]+/g,
  ];

  /**
   * Sanitize an error message by removing sensitive information
   * @param error - Error object or string to sanitize
   * @returns Sanitized error message safe for display/logging
   */
  static sanitize(error: unknown): string {
    let message: string;

    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else {
      message = String(error);
    }

    return this.sanitizeString(message);
  }

  /**
   * Sanitize a string by removing all sensitive patterns
   * @param text - Text to sanitize
   * @returns Sanitized text
   */
  static sanitizeString(text: string): string {
    let sanitized = text;

    // Replace all sensitive patterns with placeholder
    for (const pattern of this.SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, this.getPlaceholder(pattern));
    }

    return sanitized;
  }

  /**
   * Get appropriate placeholder based on pattern type
   * @param pattern - RegExp pattern that matched
   * @returns Placeholder string
   */
  private static getPlaceholder(pattern: RegExp): string {
    const patternStr = pattern.toString();

    if (patternStr.includes('sk-')) return 'sk-***';
    if (patternStr.includes('AIza')) return 'AIza***';
    if (patternStr.includes('Bearer')) return 'Bearer ***';
    if (patternStr.includes('Authorization')) return 'Authorization: ***';
    if (patternStr.includes('api')) return 'api_key=***';
    if (patternStr.includes('eyJ')) return 'jwt.***';
    if (patternStr.includes('Users')) return '/Users/***';

    return '***';
  }

  /**
   * Sanitize an error object for safe logging
   * Removes sensitive data from message, stack trace, and response data
   * @param error - Error to sanitize
   * @returns Sanitized error object safe for logging
   */
  static sanitizeError(error: unknown): {
    message: string;
    code?: string | number;
    type?: string;
    sanitized: true;
  } {
    if (!(error instanceof Error)) {
      return {
        message: this.sanitize(error),
        sanitized: true
      };
    }

    const sanitizedError: {
      message: string;
      code?: string | number;
      type?: string;
      sanitized: true;
    } = {
      message: this.sanitize(error.message),
      sanitized: true
    };

    // Safely extract error details from API responses
    const errorWithResponse = error as Error & {
      response?: {
        status?: number;
        statusText?: string;
        data?: {
          error?: {
            message?: string;
            code?: string | number;
            type?: string;
          };
        };
      };
    };

    if (errorWithResponse.response) {
      const response = errorWithResponse.response;

      // Extract status code safely
      if (response.status) {
        sanitizedError.code = response.status;
      }

      // Extract error type if available
      if (response.data?.error?.type) {
        sanitizedError.type = response.data.error.type;
      }

      // Extract and sanitize error message from response
      if (response.data?.error?.message) {
        const apiMessage = this.sanitize(response.data.error.message);
        // Only include if it adds new information
        if (apiMessage !== sanitizedError.message) {
          sanitizedError.message += ` (API: ${apiMessage})`;
        }
      }
    }

    return sanitizedError;
  }

  /**
   * Check if a string contains sensitive data
   * Useful for validation before logging
   * @param text - Text to check
   * @returns true if sensitive data detected
   */
  static containsSensitiveData(text: string): boolean {
    return this.SENSITIVE_PATTERNS.some(pattern => pattern.test(text));
  }
}
