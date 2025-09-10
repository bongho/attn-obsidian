import { PerformanceMetrics, ProcessingProgress } from './types';

export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private startTimes: Map<string, number> = new Map();
  private processingHistory: Array<{
    timestamp: number;
    fileSize: number;
    duration: number;
    metrics: PerformanceMetrics;
  }> = [];

  constructor() {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    this.metrics = {
      totalProcessingTime: 0,
      segmentationTime: 0,
      transcriptionTime: 0,
      summarizationTime: 0,
      silenceDetectionTime: 0,
      cacheHitRate: 0,
      parallelBatches: 0,
      averageBatchSize: 0,
      errorRate: 0
    };
  }

  startTimer(operation: string): void {
    this.startTimes.set(operation, Date.now());
  }

  endTimer(operation: string): number {
    const startTime = this.startTimes.get(operation);
    if (!startTime) {
      console.warn(`No start time found for operation: ${operation}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.startTimes.delete(operation);

    // Update metrics based on operation type
    switch (operation) {
      case 'segmentation':
        this.metrics.segmentationTime = duration;
        break;
      case 'transcription':
        this.metrics.transcriptionTime = duration;
        break;
      case 'summarization':
        this.metrics.summarizationTime = duration;
        break;
      case 'silenceDetection':
        this.metrics.silenceDetectionTime = duration;
        break;
      case 'total':
        this.metrics.totalProcessingTime = duration;
        break;
    }

    return duration;
  }

  updateBatchMetrics(batchCount: number, averageSize: number): void {
    this.metrics.parallelBatches = batchCount;
    this.metrics.averageBatchSize = averageSize;
  }

  updateCacheHitRate(hits: number, total: number): void {
    this.metrics.cacheHitRate = total > 0 ? (hits / total) * 100 : 0;
  }

  updateErrorRate(errors: number, total: number): void {
    this.metrics.errorRate = total > 0 ? (errors / total) * 100 : 0;
  }

  recordProcessingSession(fileSize: number, duration: number): void {
    const session = {
      timestamp: Date.now(),
      fileSize,
      duration,
      metrics: { ...this.metrics }
    };

    this.processingHistory.push(session);

    // Keep only last 50 sessions
    if (this.processingHistory.length > 50) {
      this.processingHistory.shift();
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getProcessingHistory(): Array<{
    timestamp: number;
    fileSize: number;
    duration: number;
    metrics: PerformanceMetrics;
  }> {
    return [...this.processingHistory];
  }

  generatePerformanceReport(audioFile: { name: string; size: number }): string {
    const report = [];
    
    report.push('=== ATTN Performance Report ===');
    report.push(`File: ${audioFile.name}`);
    report.push(`Size: ${(audioFile.size / 1024 / 1024).toFixed(2)} MB`);
    report.push('');
    
    report.push('Processing Times:');
    report.push(`Total: ${this.formatTime(this.metrics.totalProcessingTime)}`);
    report.push(`  - Segmentation: ${this.formatTime(this.metrics.segmentationTime)} (${this.getPercentage(this.metrics.segmentationTime, this.metrics.totalProcessingTime)}%)`);
    report.push(`  - Transcription: ${this.formatTime(this.metrics.transcriptionTime)} (${this.getPercentage(this.metrics.transcriptionTime, this.metrics.totalProcessingTime)}%)`);
    report.push(`  - Summarization: ${this.formatTime(this.metrics.summarizationTime)} (${this.getPercentage(this.metrics.summarizationTime, this.metrics.totalProcessingTime)}%)`);
    report.push(`  - Silence Detection: ${this.formatTime(this.metrics.silenceDetectionTime)} (${this.getPercentage(this.metrics.silenceDetectionTime, this.metrics.totalProcessingTime)}%)`);
    report.push('');
    
    report.push('Efficiency Metrics:');
    report.push(`Parallel Batches: ${this.metrics.parallelBatches}`);
    report.push(`Average Batch Size: ${this.metrics.averageBatchSize.toFixed(1)}`);
    report.push(`Cache Hit Rate: ${this.metrics.cacheHitRate.toFixed(1)}%`);
    report.push(`Error Rate: ${this.metrics.errorRate.toFixed(1)}%`);
    report.push('');
    
    // Performance insights
    report.push('Performance Insights:');
    if (this.metrics.cacheHitRate > 50) {
      report.push('✅ Good cache utilization');
    } else {
      report.push('⚠️  Low cache hit rate - consider processing similar files');
    }
    
    if (this.metrics.errorRate < 5) {
      report.push('✅ Low error rate');
    } else {
      report.push('❌ High error rate - check network connectivity or API keys');
    }
    
    const transcriptionRatio = parseFloat(this.getPercentage(this.metrics.transcriptionTime, this.metrics.totalProcessingTime));
    if (transcriptionRatio > 80) {
      report.push('💡 Transcription is the main bottleneck - parallel processing is working well');
    } else if (transcriptionRatio < 50) {
      report.push('⚠️  Transcription taking less time than expected - check for processing issues');
    }
    
    // Historical comparison
    if (this.processingHistory.length >= 3) {
      const recentSessions = this.processingHistory.slice(-3);
      const avgTime = recentSessions.reduce((sum, session) => sum + session.metrics.totalProcessingTime, 0) / recentSessions.length;
      
      if (this.metrics.totalProcessingTime < avgTime * 0.8) {
        report.push('🚀 Processing faster than recent average');
      } else if (this.metrics.totalProcessingTime > avgTime * 1.2) {
        report.push('🐌 Processing slower than recent average');
      }
    }
    
    report.push('');
    report.push('=== End Report ===');
    
    return report.join('\n');
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private getPercentage(part: number, total: number): string {
    if (total === 0) return '0';
    return ((part / total) * 100).toFixed(1);
  }

  reset(): void {
    this.initializeMetrics();
    this.startTimes.clear();
  }

  // Export/Import for persistence
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      history: this.processingHistory
    }, null, 2);
  }

  importMetrics(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      if (parsed.metrics && parsed.history) {
        this.metrics = parsed.metrics;
        this.processingHistory = parsed.history;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to import metrics:', error);
      return false;
    }
  }
}

// Singleton instance for global use
export const performanceMonitor = new PerformanceMonitor();