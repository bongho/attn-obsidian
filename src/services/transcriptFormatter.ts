/**
 * Transcript formatting service
 * Handles formatting of transcription results with timestamps and grouping
 */

import { VerboseTranscriptionResult } from '../types';
import { TRANSCRIPT_FORMATTING } from '../constants';

export class TranscriptFormatter {
  /**
   * Format transcription result with timestamps and grouped segments
   * @param verboseResult The transcription result to format
   * @returns Formatted transcript with timestamps
   */
  static formatWithTimestamps(verboseResult: VerboseTranscriptionResult): string {
    if (!verboseResult.segments || verboseResult.segments.length === 0) {
      return verboseResult.text || '음성 인식 결과가 없습니다.';
    }

    const segments = verboseResult.segments;
    const lines: string[] = [];

    // Group consecutive segments that are likely from the same speaker
    let currentGroup: string[] = [];
    let currentStartTime = 0;
    let currentEndTime = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Initialize group if it's empty
      if (currentGroup.length === 0) {
        currentStartTime = segment.start;
        currentGroup.push(segment.text.trim());
        currentEndTime = segment.end;
        continue;
      }

      // Check if this segment should be grouped with the previous ones
      const timeDifference = segment.start - currentEndTime;
      const shouldGroup = timeDifference < TRANSCRIPT_FORMATTING.SEGMENT_GROUP_TIME_THRESHOLD_SEC;

      if (shouldGroup && currentGroup.length < TRANSCRIPT_FORMATTING.MAX_SEGMENTS_PER_GROUP) {
        currentGroup.push(segment.text.trim());
        currentEndTime = segment.end;
      } else {
        // Finalize current group and start new one
        const groupText = currentGroup.join(' ').trim();
        if (groupText) {
          const timeRange = currentStartTime === currentEndTime
            ? this.formatTime(currentStartTime)
            : `${this.formatTime(currentStartTime)}-${this.formatTime(currentEndTime)}`;
          lines.push(`**[${timeRange}]**`);
          lines.push(`${groupText}\n`);
        }

        // Start new group
        currentGroup = [segment.text.trim()];
        currentStartTime = segment.start;
        currentEndTime = segment.end;
      }
    }

    // Don't forget the last group
    if (currentGroup.length > 0) {
      const groupText = currentGroup.join(' ').trim();
      if (groupText) {
        const timeRange = currentStartTime === currentEndTime
          ? this.formatTime(currentStartTime)
          : `${this.formatTime(currentStartTime)}-${this.formatTime(currentEndTime)}`;
        lines.push(`**[${timeRange}]**`);
        lines.push(`${groupText}\n`);
      }
    }

    // Add summary statistics at the beginning
    const totalDuration = verboseResult.duration || this.estimateAudioDuration(verboseResult);
    const header = `## 📝 음성 인식 원문\n\n` +
      `**⏱️ 총 시간:** ${Math.floor(totalDuration / 60)}분 ${Math.floor(totalDuration % 60)}초  ` +
      `**🎙️ 세그먼트:** ${segments.length}개  ` +
      `**📄 텍스트 길이:** ${verboseResult.text.length.toLocaleString()}자\n\n` +
      `---\n\n`;

    return header + lines.join('\n');
  }

  /**
   * Format time in MM:SS format
   * @param seconds Time in seconds
   * @returns Formatted time string
   */
  private static formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Estimate audio duration from transcription segments
   * @param verboseResult The transcription result
   * @returns Estimated duration in seconds
   */
  private static estimateAudioDuration(verboseResult: VerboseTranscriptionResult): number {
    if (!verboseResult.segments || verboseResult.segments.length === 0) {
      return 0;
    }

    // Find the last segment's end time
    const lastSegment = verboseResult.segments[verboseResult.segments.length - 1];
    return lastSegment.end || 0;
  }
}
