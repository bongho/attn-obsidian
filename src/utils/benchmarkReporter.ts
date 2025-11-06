/**
 * Benchmark Reporter for ATTN Performance Testing
 *
 * Tracks and reports performance metrics for comparing
 * Phase 1+2 improvements against baseline
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface BenchmarkMetrics {
  // File info
  fileName: string;
  fileSizeBytes: number;
  durationSeconds: number;

  // Processing times
  totalProcessingTime: number;
  segmentationTime: number;
  transcriptionTime: number;
  summarizationTime?: number;

  // Quality metrics
  chunkCount: number;
  transcriptionLength: number;
  averageChunkSize: number;
  cacheHit: boolean;

  // VAD metrics
  vadUsed: boolean;
  silenceIntervalsDetected: number;

  // Context management
  contextPromptsUsed: number;

  // Deduplication
  duplicateWordsRemoved: number;

  // Provider info
  provider: string;
  model: string;
  language: string;

  // Timestamp
  timestamp: number;
}

export interface BenchmarkComparison {
  baseline: BenchmarkMetrics;
  improved: BenchmarkMetrics;
  improvements: {
    processingTimeReduction: number; // percentage
    chunkCountChange: number;
    qualityScore: number; // 0-100
    cacheEffectiveness: number; // percentage
  };
}

export class BenchmarkReporter {
  private reportDir: string;
  private metricsHistory: BenchmarkMetrics[] = [];

  constructor(reportDir?: string) {
    this.reportDir = reportDir || join(tmpdir(), 'attn-benchmarks');
    this.ensureReportDir();
  }

  /**
   * Record a benchmark run
   */
  recordMetrics(metrics: BenchmarkMetrics): void {
    this.metricsHistory.push(metrics);
    this.saveMetrics(metrics);
    console.log(`📊 Recorded benchmark for ${metrics.fileName}`);
  }

  /**
   * Compare two benchmark runs (baseline vs improved)
   */
  compareRuns(baselineId: string, improvedId: string): BenchmarkComparison | null {
    const baseline = this.metricsHistory.find(m =>
      m.fileName === baselineId || m.timestamp.toString() === baselineId
    );
    const improved = this.metricsHistory.find(m =>
      m.fileName === improvedId || m.timestamp.toString() === improvedId
    );

    if (!baseline || !improved) {
      console.error('Could not find metrics for comparison');
      return null;
    }

    const processingTimeReduction =
      ((baseline.totalProcessingTime - improved.totalProcessingTime) / baseline.totalProcessingTime) * 100;

    const chunkCountChange = improved.chunkCount - baseline.chunkCount;

    // Quality score: longer transcription + fewer chunks + VAD usage = better
    const qualityScore = this.calculateQualityScore(baseline, improved);

    const cacheEffectiveness = improved.cacheHit ? 100 : 0;

    const comparison: BenchmarkComparison = {
      baseline,
      improved,
      improvements: {
        processingTimeReduction,
        chunkCountChange,
        qualityScore,
        cacheEffectiveness
      }
    };

    this.saveComparison(comparison);
    return comparison;
  }

  /**
   * Generate markdown report
   */
  generateReport(comparison: BenchmarkComparison): string {
    const { baseline, improved, improvements } = comparison;

    const report = `# ATTN Performance Benchmark Report

## Test Configuration
**File**: ${baseline.fileName}
**Size**: ${(baseline.fileSizeBytes / 1024 / 1024).toFixed(2)} MB
**Duration**: ${(baseline.durationSeconds / 60).toFixed(1)} minutes
**Date**: ${new Date().toISOString()}

---

## Processing Time Comparison

| Metric | Baseline | Improved | Change |
|--------|----------|----------|--------|
| **Total Time** | ${(baseline.totalProcessingTime / 1000).toFixed(1)}s | ${(improved.totalProcessingTime / 1000).toFixed(1)}s | ${improvements.processingTimeReduction > 0 ? '🟢' : '🔴'} **${Math.abs(improvements.processingTimeReduction).toFixed(1)}%** |
| Segmentation | ${(baseline.segmentationTime / 1000).toFixed(1)}s | ${(improved.segmentationTime / 1000).toFixed(1)}s | ${this.formatChange(baseline.segmentationTime, improved.segmentationTime)} |
| Transcription | ${(baseline.transcriptionTime / 1000).toFixed(1)}s | ${(improved.transcriptionTime / 1000).toFixed(1)}s | ${this.formatChange(baseline.transcriptionTime, improved.transcriptionTime)} |

---

## Quality Metrics

| Metric | Baseline | Improved | Analysis |
|--------|----------|----------|----------|
| **Chunk Count** | ${baseline.chunkCount} | ${improved.chunkCount} | ${improvements.chunkCountChange < 0 ? '🟢 Better chunking' : improvements.chunkCountChange === 0 ? '➖ Same' : '🔴 More chunks'} |
| **Transcription Length** | ${baseline.transcriptionLength} chars | ${improved.transcriptionLength} chars | ${improved.transcriptionLength > baseline.transcriptionLength ? '🟢 More content' : '⚠️ Less content'} |
| **Avg Chunk Size** | ${(baseline.averageChunkSize / 1024).toFixed(1)} KB | ${(improved.averageChunkSize / 1024).toFixed(1)} KB | ${this.formatChange(baseline.averageChunkSize, improved.averageChunkSize)} |
| **Quality Score** | - | ${improvements.qualityScore.toFixed(1)}/100 | ${improvements.qualityScore >= 80 ? '🟢 Excellent' : improvements.qualityScore >= 60 ? '🟡 Good' : '🔴 Needs improvement'} |

---

## Feature Usage

### Phase 1 Features
- **VAD (Voice Activity Detection)**: ${improved.vadUsed ? '✅ Enabled' : '❌ Disabled'}
  - Silence intervals detected: ${improved.silenceIntervalsDetected}
- **Smart Deduplication**: ${improved.duplicateWordsRemoved} words removed

### Phase 2 Features
- **Context Prompts**: ${improved.contextPromptsUsed} prompts used
- **Cache Hit**: ${improved.cacheHit ? '✅ Yes (100% time saved)' : '❌ No'}

---

## Improvements Summary

${improvements.processingTimeReduction > 0
  ? `✅ **Processing time reduced by ${improvements.processingTimeReduction.toFixed(1)}%**`
  : `⚠️ Processing time increased by ${Math.abs(improvements.processingTimeReduction).toFixed(1)}%`}

${improvements.chunkCountChange < 0
  ? `✅ **${Math.abs(improvements.chunkCountChange)} fewer chunks** (better segmentation)`
  : improvements.chunkCountChange === 0
    ? `➖ Same number of chunks`
    : `⚠️ ${improvements.chunkCountChange} more chunks`}

${improved.vadUsed && !baseline.vadUsed
  ? `✅ **VAD enabled** - more accurate silence detection`
  : ''}

${improved.contextPromptsUsed > 0
  ? `✅ **Context continuity** - ${improved.contextPromptsUsed} prompts for better coherence`
  : ''}

${improved.duplicateWordsRemoved > 0
  ? `✅ **Deduplication** - ${improved.duplicateWordsRemoved} duplicate words removed`
  : ''}

---

## Configuration

**Baseline**:
- Provider: ${baseline.provider}
- Model: ${baseline.model}
- Language: ${baseline.language}
- VAD: ${baseline.vadUsed ? 'Enabled' : 'Disabled'}

**Improved**:
- Provider: ${improved.provider}
- Model: ${improved.model}
- Language: ${improved.language}
- VAD: ${improved.vadUsed ? 'Enabled' : 'Disabled'}

---

## Recommendations

${this.generateRecommendations(comparison)}

---

*Generated by ATTN Benchmark Reporter*
*Timestamp: ${Date.now()}*
`;

    return report;
  }

  /**
   * Save report to file
   */
  saveReport(comparison: BenchmarkComparison, filename?: string): string {
    const report = this.generateReport(comparison);
    const reportPath = join(
      this.reportDir,
      filename || `benchmark-${Date.now()}.md`
    );

    writeFileSync(reportPath, report, 'utf-8');
    console.log(`✅ Benchmark report saved: ${reportPath}`);
    return reportPath;
  }

  /**
   * Get latest metrics
   */
  getLatestMetrics(count: number = 5): BenchmarkMetrics[] {
    return this.metricsHistory.slice(-count);
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(baseline: BenchmarkMetrics, improved: BenchmarkMetrics): number {
    let score = 50; // Base score

    // Transcription length (more is better, up to +20)
    const lengthIncrease = (improved.transcriptionLength - baseline.transcriptionLength) / baseline.transcriptionLength;
    score += Math.min(lengthIncrease * 100, 20);

    // Fewer chunks is better (up to +15)
    const chunkReduction = (baseline.chunkCount - improved.chunkCount) / baseline.chunkCount;
    score += Math.min(chunkReduction * 50, 15);

    // VAD usage (+10)
    if (improved.vadUsed && !baseline.vadUsed) {
      score += 10;
    }

    // Context prompts usage (+10)
    if (improved.contextPromptsUsed > 0) {
      score += 10;
    }

    // Deduplication (+5)
    if (improved.duplicateWordsRemoved > 0) {
      score += 5;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Format change percentage
   */
  private formatChange(baseline: number, improved: number): string {
    const change = ((improved - baseline) / baseline) * 100;
    if (Math.abs(change) < 1) return '➖ ~0%';
    return change < 0
      ? `🟢 -${Math.abs(change).toFixed(1)}%`
      : `🔴 +${change.toFixed(1)}%`;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(comparison: BenchmarkComparison): string {
    const { baseline, improved, improvements } = comparison;
    const recommendations: string[] = [];

    if (!improved.vadUsed) {
      recommendations.push('- Consider enabling VAD for more accurate silence detection');
    }

    if (improvements.processingTimeReduction < 10) {
      recommendations.push('- Processing time improvement is minimal. Consider Phase 3 optimizations (MLX, parallel processing)');
    }

    if (improved.chunkCount > baseline.chunkCount) {
      recommendations.push('- Chunk count increased. Review segmentation settings or VAD thresholds');
    }

    if (!improved.cacheHit && improved.fileName === baseline.fileName) {
      recommendations.push('- Cache miss detected. Ensure cache is enabled and working correctly');
    }

    if (improved.contextPromptsUsed === 0 && improved.chunkCount > 1) {
      recommendations.push('- Context prompts not used. Enable for better transcription coherence');
    }

    if (improvements.qualityScore < 60) {
      recommendations.push('- Quality score is low. Review VAD settings, context usage, and deduplication');
    }

    if (recommendations.length === 0) {
      recommendations.push('- ✅ All optimizations are working well! No immediate improvements needed.');
    }

    return recommendations.join('\n');
  }

  /**
   * Save metrics to JSON
   */
  private saveMetrics(metrics: BenchmarkMetrics): void {
    const metricsPath = join(this.reportDir, `metrics-${metrics.timestamp}.json`);
    writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf-8');
  }

  /**
   * Save comparison to JSON
   */
  private saveComparison(comparison: BenchmarkComparison): void {
    const comparisonPath = join(this.reportDir, `comparison-${Date.now()}.json`);
    writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2), 'utf-8');
  }

  /**
   * Ensure report directory exists
   */
  private ensureReportDir(): void {
    if (!existsSync(this.reportDir)) {
      mkdirSync(this.reportDir, { recursive: true });
      console.log(`Created benchmark report directory: ${this.reportDir}`);
    }
  }
}
