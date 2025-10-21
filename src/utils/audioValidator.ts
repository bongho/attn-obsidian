/**
 * Audio file validation utility
 * Validates audio files before processing
 */

import { FILE_SIZE_LIMITS, AUDIO_FORMATS } from '../constants';

export interface AudioValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export class AudioValidator {
  /**
   * Validate an audio file for processing
   * @param audioFile The audio file to validate
   * @returns Validation result with error/warning messages
   */
  static validate(audioFile: File): AudioValidationResult {
    const warnings: string[] = [];

    // Check if file exists and has content
    if (audioFile.size === 0) {
      return {
        isValid: false,
        error: '오디오 파일이 비어있습니다.'
      };
    }

    // Check minimum file size
    if (audioFile.size < FILE_SIZE_LIMITS.MIN_FILE_SIZE_BYTES) {
      return {
        isValid: false,
        error: '오디오 파일이 너무 작습니다. 유효한 오디오 콘텐츠가 있는지 확인해주세요.'
      };
    }

    // Warn about large files
    if (audioFile.size > FILE_SIZE_LIMITS.LARGE_FILE_WARNING_MB * 1024 * 1024) {
      warnings.push(`Large audio file: ${(audioFile.size / 1024 / 1024).toFixed(2)}MB`);
    }

    // Check file extension
    const fileExtension = this.getFileExtension(audioFile.name);
    const validExtensions = AUDIO_FORMATS.VALID_EXTENSIONS;

    if (!validExtensions.includes(fileExtension as any)) {
      warnings.push(
        `Unsupported file extension: ${fileExtension}. Supported: ${validExtensions.join(', ')}`
      );
      // Don't fail, just warn - OpenAI might support it
    }

    // Check MIME type if available
    if (audioFile.type && !audioFile.type.startsWith('audio/') && !audioFile.type.startsWith('video/')) {
      warnings.push(`Unexpected MIME type: ${audioFile.type}`);
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Get the file extension from a filename
   * @param filename The filename
   * @returns The file extension (including the dot)
   */
  private static getFileExtension(filename: string): string {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  /**
   * Check if a file extension is supported
   * @param extension The file extension to check
   * @returns True if supported
   */
  static isSupportedExtension(extension: string): boolean {
    return AUDIO_FORMATS.VALID_EXTENSIONS.includes(extension as any);
  }

  /**
   * Get file size in megabytes
   * @param sizeBytes File size in bytes
   * @returns File size in MB formatted to 2 decimal places
   */
  static formatFileSize(sizeBytes: number): string {
    return (sizeBytes / 1024 / 1024).toFixed(2);
  }
}
