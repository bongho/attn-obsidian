/**
 * Application-wide constants
 * Centralized configuration for magic numbers and tunable parameters
 */

// ============================================================================
// File Size Limits
// ============================================================================
export const FILE_SIZE_LIMITS = {
  /** Official OpenAI Whisper API limit in MB */
  OPENAI_API_LIMIT_MB: 25,

  /** FormData encoding overhead factor (~15%) */
  FORMDATA_OVERHEAD_FACTOR: 1.15,

  /** Conservative limit to prevent 413 errors (accounting for FormData overhead) */
  CONSERVATIVE_LIMIT_MB: 23,

  /** Minimum file size in bytes (1KB) */
  MIN_FILE_SIZE_BYTES: 1000,

  /** Large file warning threshold in MB */
  LARGE_FILE_WARNING_MB: 100,
} as const;

// ============================================================================
// Audio Processing Settings
// ============================================================================
export const AUDIO_PROCESSING = {
  /** Maximum chunk duration in seconds (2.5 minutes) */
  MAX_CHUNK_DURATION_SEC: 150,

  /** Target sample rate in Hz */
  TARGET_SAMPLE_RATE_HZ: 16000,

  /** Target audio channels (mono) */
  TARGET_CHANNELS: 1 as const,

  /** Silence threshold in dB */
  SILENCE_THRESHOLD_DB: -30,

  /** Minimum silence duration in milliseconds */
  MIN_SILENCE_MS: 800,

  /** Hard split window in seconds */
  HARD_SPLIT_WINDOW_SEC: 45,

  /** Context overlap between chunks in seconds */
  CONTEXT_OVERLAP_SEC: 10,
} as const;

// ============================================================================
// Batch Processing
// ============================================================================
export const BATCH_PROCESSING = {
  /** Batch size for large segment counts (>100 segments) */
  LARGE_BATCH_SIZE: 15,

  /** Batch size for medium segment counts (50-100 segments) */
  MEDIUM_BATCH_SIZE: 12,

  /** Batch size for small segment counts (<50 segments) */
  SMALL_BATCH_SIZE: 10,

  /** Threshold for "large" segment count */
  LARGE_SEGMENT_THRESHOLD: 100,

  /** Threshold for "medium" segment count */
  MEDIUM_SEGMENT_THRESHOLD: 50,

  /** Minimum delay between batches in milliseconds */
  MIN_BATCH_DELAY_MS: 1000,

  /** Delay multiplier per batch item in milliseconds */
  BATCH_DELAY_MULTIPLIER_MS: 200,
} as const;

// ============================================================================
// Summarization Settings
// ============================================================================
export const SUMMARIZATION = {
  /** Ultra-long meeting threshold in seconds (1 hour) */
  ULTRA_LONG_DURATION_SEC: 3600,

  /** Minimum segments for hierarchical summarization */
  MIN_SEGMENTS_FOR_HIERARCHICAL: 50,

  /** Segment group size for partial summaries */
  SEGMENT_GROUP_SIZE: 8,

  /** Maximum tokens for GPT models (conservative) */
  MAX_TOKENS: 12000,

  /** Maximum text length per group in characters */
  MAX_GROUP_LENGTH_CHARS: 3000,

  /** Rate limiting delay between groups in milliseconds */
  GROUP_DELAY_MS: 1500,

  /** Estimated characters per token */
  CHARS_PER_TOKEN: 4,
} as const;

// ============================================================================
// Retry Settings
// ============================================================================
export const RETRY_SETTINGS = {
  /** Maximum retry attempts */
  MAX_RETRIES: 3,

  /** Initial retry delay in milliseconds */
  INITIAL_RETRY_DELAY_MS: 500,

  /** Retry delay multiplier (exponential backoff) */
  RETRY_DELAY_MULTIPLIER: 2,
} as const;

// ============================================================================
// Timeout Settings
// ============================================================================
export const TIMEOUT_SETTINGS = {
  /** Default API request timeout in milliseconds (2 minutes) */
  DEFAULT_API_TIMEOUT_MS: 120000,
} as const;

// ============================================================================
// Transcript Formatting
// ============================================================================
export const TRANSCRIPT_FORMATTING = {
  /** Time difference threshold for grouping segments in seconds */
  SEGMENT_GROUP_TIME_THRESHOLD_SEC: 2.0,

  /** Maximum segments per group */
  MAX_SEGMENTS_PER_GROUP: 5,
} as const;

// ============================================================================
// Audio Duration Estimation
// ============================================================================
export const DURATION_ESTIMATION = {
  /** Approximate MB per minute for compressed audio */
  MB_PER_MINUTE: 1,

  /** Seconds per minute */
  SECONDS_PER_MINUTE: 60,
} as const;

// ============================================================================
// Supported Audio Formats
// ============================================================================
export const AUDIO_FORMATS = {
  /** Supported audio file extensions */
  VALID_EXTENSIONS: ['.m4a', '.mp3', '.wav', '.flac', '.aac', '.ogg', '.webm', '.mp4'] as const,

  /** Default audio codec for processing */
  DEFAULT_CODEC: 'aac',

  /** Default audio bitrate */
  DEFAULT_BITRATE: '128k',
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get batch size based on segment count
 */
export function getBatchSize(segmentCount: number): number {
  if (segmentCount > BATCH_PROCESSING.LARGE_SEGMENT_THRESHOLD) {
    return BATCH_PROCESSING.LARGE_BATCH_SIZE;
  } else if (segmentCount > BATCH_PROCESSING.MEDIUM_SEGMENT_THRESHOLD) {
    return BATCH_PROCESSING.MEDIUM_BATCH_SIZE;
  } else {
    return BATCH_PROCESSING.SMALL_BATCH_SIZE;
  }
}

/**
 * Get batch delay based on batch size
 */
export function getBatchDelay(batchSize: number): number {
  return Math.max(
    BATCH_PROCESSING.MIN_BATCH_DELAY_MS,
    batchSize * BATCH_PROCESSING.BATCH_DELAY_MULTIPLIER_MS
  );
}

/**
 * Estimate file duration from size
 */
export function estimateFileDuration(sizeBytes: number): number {
  return (sizeBytes / (1024 * 1024)) * DURATION_ESTIMATION.SECONDS_PER_MINUTE;
}
