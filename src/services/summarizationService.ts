/**
 * Summarization service
 * Handles both standard and hierarchical summarization of transcription results
 */

import { ConfigLoader } from '../configLoader';
import { createSummarizationProvider } from '../providers/providerFactory';
import { ErrorSanitizer } from '../utils/errorSanitizer';
import { VerboseTranscriptionResult, ATTNSettings } from '../types';
import { SUMMARIZATION } from '../constants';

export class SummarizationService {
  private config: ConfigLoader;
  private settings: ATTNSettings;

  constructor(settings: ATTNSettings) {
    this.config = ConfigLoader.getInstance();
    this.settings = settings;
  }

  /**
   * Summarize transcription result (auto-selects strategy based on duration)
   * @param verboseResult The transcription result
   * @param customSystemPrompt Optional custom system prompt
   * @returns Summary text
   */
  async summarize(verboseResult: VerboseTranscriptionResult, customSystemPrompt?: string): Promise<string> {
    try {
      const estimatedDuration = verboseResult.duration || this.estimateAudioDuration(verboseResult);
      const isUltraLong = estimatedDuration > SUMMARIZATION.ULTRA_LONG_DURATION_SEC;

      if (isUltraLong && verboseResult.segments.length > SUMMARIZATION.MIN_SEGMENTS_FOR_HIERARCHICAL) {
        // Use hierarchical summarization for ultra-long meetings
        if (this.config.isDebugMode()) {
          console.log(`🔧 ATTN Debug: Using hierarchical summarization for ${Math.round(estimatedDuration / 60)}-minute meeting`);
        }

        return await this.hierarchicalSummarization(verboseResult, customSystemPrompt);
      } else {
        // Use standard summarization for shorter meetings
        return await this.standardSummarization(verboseResult, customSystemPrompt);
      }
    } catch (error) {
      if (error instanceof Error) {
        // Enhanced error reporting with security sanitization
        const sanitizedError = ErrorSanitizer.sanitizeError(error);

        console.error('Summarization error details:', {
          message: sanitizedError.message,
          code: sanitizedError.code || 'unknown',
          type: sanitizedError.type || 'unknown',
          provider: this.settings.summary.provider,
          model: this.settings.summary.model
        });

        // User-facing error message (sanitized)
        throw new Error(`요약 생성 실패 (${sanitizedError.code || 'unknown'}): ${sanitizedError.message}`);
      }
      throw error;
    }
  }

  /**
   * Standard summarization for shorter meetings
   * @param verboseResult The transcription result
   * @param customSystemPrompt Optional custom system prompt
   * @returns Summary text
   */
  private async standardSummarization(verboseResult: VerboseTranscriptionResult, customSystemPrompt?: string): Promise<string> {
    // Get effective Summary settings
    const effectiveSummarySettings = {
      ...this.settings.summary,
      apiKey: this.settings.summary.apiKey || this.settings.openaiApiKey || this.config.getOpenAIApiKey() || ''
    };

    if (!effectiveSummarySettings.apiKey && effectiveSummarySettings.provider === 'openai') {
      throw new Error('Summary API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.');
    }

    // Get timeout from settings
    const timeout = this.settings.processing?.apiTimeoutMs;
    const summaryProvider = createSummarizationProvider(effectiveSummarySettings, timeout);

    // Use custom system prompt if provided, otherwise use settings
    const systemPrompt = customSystemPrompt || this.settings.systemPrompt;

    // Enhanced context information for better meeting summarization
    const estimatedDuration = verboseResult.duration || this.estimateAudioDuration(verboseResult);
    const speakerInfo = verboseResult.speakers
      ? `참석자: ${verboseResult.speakers.length}명`
      : '참석자: 화자 분리 정보 없음';

    const meetingContext = `
이것은 약 ${Math.round(estimatedDuration / 60)}분간의 회의 내용입니다.
${speakerInfo}
총 ${verboseResult.segments.length}개의 발언 구간으로 구성되어 있습니다.

회의의 전체적인 흐름과 맥락을 고려하여 일관성 있게 요약해주세요.
`;

    const input = {
      text: meetingContext + '\n\n' + verboseResult.text,
      segments: verboseResult.segments,
      language: verboseResult.language,
      duration: estimatedDuration,
      speakers: verboseResult.speakers
    };

    const result = await summaryProvider.summarize(input, {
      model: effectiveSummarySettings.model
    });

    if (this.config.isDebugMode()) {
      console.log(`🔧 ATTN Debug: Standard summary completed using ${effectiveSummarySettings.provider}/${effectiveSummarySettings.model}`);
      console.log(`🔧 ATTN Debug: Used ${verboseResult.segments.length} segments for enhanced summarization`);
    }

    return result;
  }

  /**
   * Hierarchical summarization for ultra-long meetings
   * @param verboseResult The transcription result
   * @param customSystemPrompt Optional custom system prompt
   * @returns Summary text
   */
  private async hierarchicalSummarization(verboseResult: VerboseTranscriptionResult, customSystemPrompt?: string): Promise<string> {
    const effectiveSummarySettings = {
      ...this.settings.summary,
      apiKey: this.settings.summary.apiKey || this.settings.openaiApiKey || this.config.getOpenAIApiKey() || ''
    };

    if (!effectiveSummarySettings.apiKey && effectiveSummarySettings.provider === 'openai') {
      throw new Error('Summary API 키가 설정되지 않았습니다. 플러그인 설정에서 API 키를 입력해주세요.');
    }

    // Get timeout from settings
    const timeout = this.settings.processing?.apiTimeoutMs;
    const summaryProvider = createSummarizationProvider(effectiveSummarySettings, timeout);
    const estimatedDuration = verboseResult.duration || this.estimateAudioDuration(verboseResult);
    const speakerInfo = verboseResult.speakers
      ? `참석자: ${verboseResult.speakers.length}명`
      : '참석자: 화자 분리 정보 없음';

    if (this.config.isDebugMode()) {
      console.log(`🔧 ATTN Debug: Starting hierarchical summarization for ${verboseResult.segments.length} segments`);
    }

    // Phase 1: Create partial summaries from segment groups
    const partialSummaries = await this.createPartialSummaries(verboseResult, summaryProvider, effectiveSummarySettings);

    if (this.config.isDebugMode()) {
      console.log(`🔧 ATTN Debug: Created ${partialSummaries.length} partial summaries`);
    }

    // Phase 2: Consolidate partial summaries into final summary
    const finalSummaryContext = `
이것은 약 ${Math.round(estimatedDuration / 60)}분간의 회의에서 생성된 ${partialSummaries.length}개의 부분 요약을 통합한 내용입니다.
${speakerInfo}

각 부분 요약의 내용과 맥락을 종합하여 일관성 있고 포괄적인 최종 회의록을 작성해주세요.
회의의 전체적인 흐름, 주요 결정사항, 액션 아이템을 명확히 정리해주세요.
`;

    // Check total length and truncate if necessary to avoid token limits
    const maxTokens = SUMMARIZATION.MAX_TOKENS;
    const estimatedTokens = (finalSummaryContext.length + partialSummaries.join('\n\n---\n\n').length) / SUMMARIZATION.CHARS_PER_TOKEN;

    let consolidatedText = finalSummaryContext + '\n\n' + partialSummaries.join('\n\n---\n\n');

    if (estimatedTokens > maxTokens) {
      // Truncate partial summaries if too long
      const maxPartialLength = Math.floor((maxTokens * SUMMARIZATION.CHARS_PER_TOKEN - finalSummaryContext.length) / partialSummaries.length);
      const truncatedSummaries = partialSummaries.map(summary =>
        summary.length > maxPartialLength ? summary.substring(0, maxPartialLength) + '...' : summary
      );

      consolidatedText = finalSummaryContext + '\n\n' + truncatedSummaries.join('\n\n---\n\n');

      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Truncated summaries to fit token limit (${estimatedTokens} -> ${consolidatedText.length / SUMMARIZATION.CHARS_PER_TOKEN} est. tokens)`);
      }
    }

    const consolidatedInput = {
      text: consolidatedText,
      segments: [], // Not needed for final consolidation
      language: verboseResult.language,
      duration: estimatedDuration,
      speakers: verboseResult.speakers
    };

    try {
      const finalSummary = await summaryProvider.summarize(consolidatedInput, {
        model: effectiveSummarySettings.model
      });

      return finalSummary;
    } catch (error) {
      // Fallback: if final consolidation fails, return concatenated partial summaries
      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Final consolidation failed, returning concatenated summaries: ${(error as Error).message}`);
      }

      return partialSummaries.join('\n\n=== 구간 요약 ===\n\n');
    }
  }

  /**
   * Create partial summaries from segment groups
   * @param verboseResult The transcription result
   * @param summaryProvider The summarization provider
   * @param effectiveSummarySettings The effective summary settings
   * @returns Array of partial summaries
   */
  private async createPartialSummaries(
    verboseResult: VerboseTranscriptionResult,
    summaryProvider: any,
    effectiveSummarySettings: any
  ): Promise<string[]> {
    const groupSize = SUMMARIZATION.SEGMENT_GROUP_SIZE;
    const segmentGroups = this.chunkArray(verboseResult.segments, groupSize);
    const partialSummaries: string[] = [];

    // Process groups sequentially to avoid rate limits
    for (let i = 0; i < segmentGroups.length; i++) {
      const group = segmentGroups[i];
      const globalGroupIndex = i;
      const groupStartTime = group[0]?.start || 0;
      const groupEndTime = group[group.length - 1]?.end || 0;

      const groupText = group.map(segment => segment.text).join(' ');

      // Check text length and truncate if too long
      const maxGroupLength = SUMMARIZATION.MAX_GROUP_LENGTH_CHARS;
      const truncatedGroupText = groupText.length > maxGroupLength ?
        groupText.substring(0, maxGroupLength) + '...' : groupText;

      const groupContext = `
이것은 회의의 ${this.formatTime(groupStartTime)}부터 ${this.formatTime(groupEndTime)}까지의 내용입니다 (구간 ${globalGroupIndex + 1}/${segmentGroups.length}).

이 구간의 주요 내용을 간결하게 요약해주세요 (2-3문장으로):
`;

      const input = {
        text: groupContext + '\n\n' + truncatedGroupText,
        segments: group,
        language: verboseResult.language
      };

      if (this.config.isDebugMode()) {
        console.log(`🔧 ATTN Debug: Processing group ${globalGroupIndex + 1}/${segmentGroups.length} (${group.length} segments, ${truncatedGroupText.length} chars)`);
      }

      try {
        const partialSummary = await summaryProvider.summarize(input, {
          model: effectiveSummarySettings.model
        });
        partialSummaries.push(partialSummary);

        if (this.config.isDebugMode()) {
          console.log(`🔧 ATTN Debug: Successfully processed group ${globalGroupIndex + 1}`);
        }
      } catch (error) {
        console.warn(`Failed to create partial summary for group ${globalGroupIndex + 1}:`, error);
        // Add a fallback summary using the original text
        const fallbackSummary = `구간 ${globalGroupIndex + 1} (${this.formatTime(groupStartTime)}-${this.formatTime(groupEndTime)}): ${truncatedGroupText.substring(0, 200)}...`;
        partialSummaries.push(fallbackSummary);
      }

      // Rate limiting delay between groups
      if (i < segmentGroups.length - 1) {
        await this.sleep(SUMMARIZATION.GROUP_DELAY_MS);
      }
    }

    return partialSummaries;
  }

  /**
   * Chunk an array into smaller arrays
   * @param array The array to chunk
   * @param chunkSize The size of each chunk
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Format time in MM:SS format
   * @param seconds Time in seconds
   * @returns Formatted time string
   */
  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Sleep for a given number of milliseconds
   * @param ms Milliseconds to sleep
   * @returns Promise that resolves after the given time
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Estimate audio duration from transcription segments
   * @param verboseResult The transcription result
   * @returns Estimated duration in seconds
   */
  private estimateAudioDuration(verboseResult: VerboseTranscriptionResult): number {
    if (!verboseResult.segments || verboseResult.segments.length === 0) {
      return 0;
    }

    // Find the last segment's end time
    const lastSegment = verboseResult.segments[verboseResult.segments.length - 1];
    return lastSegment.end || 0;
  }
}
