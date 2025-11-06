/**
 * Result Caching System for ATTN
 * Inspired by Lightning-SimulWhisper's efficiency patterns
 *
 * Features:
 * - File hash-based caching for transcription results
 * - Persistent cache with TTL support
 * - Cache invalidation and cleanup
 */

import { createHash } from 'crypto';
import { VerboseTranscriptionResult } from '../types';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface CacheEntry {
  fileHash: string;
  settingsHash: string;
  result: VerboseTranscriptionResult;
  timestamp: number;
  fileSize: number;
  fileName: string;
}

export interface CacheOptions {
  /** Cache directory path (default: OS temp dir) */
  cacheDir?: string;

  /** Time-to-live in milliseconds (default: 7 days) */
  ttl?: number;

  /** Maximum cache size in bytes (default: 500MB) */
  maxCacheSize?: number;

  /** Enable cache (default: true) */
  enabled?: boolean;
}

export class CacheManager {
  private cacheDir: string;
  private ttl: number;
  private maxCacheSize: number;
  private enabled: boolean;

  private readonly DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly DEFAULT_MAX_SIZE = 500 * 1024 * 1024; // 500MB

  constructor(options: CacheOptions = {}) {
    this.cacheDir = options.cacheDir || join(tmpdir(), 'attn-cache');
    this.ttl = options.ttl || this.DEFAULT_TTL;
    this.maxCacheSize = options.maxCacheSize || this.DEFAULT_MAX_SIZE;
    this.enabled = options.enabled !== false;

    if (this.enabled) {
      this.ensureCacheDir();
      this.cleanupExpiredEntries();
    }
  }

  /**
   * Get cached transcription result
   */
  async get(
    fileBuffer: Buffer | ArrayBuffer,
    fileName: string,
    settings: { provider: string; model: string; language: string }
  ): Promise<VerboseTranscriptionResult | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const fileHash = this.calculateFileHash(fileBuffer);
      const settingsHash = this.calculateSettingsHash(settings);
      const cacheKey = `${fileHash}_${settingsHash}`;
      const cachePath = this.getCachePath(cacheKey);

      if (!existsSync(cachePath)) {
        console.log(`Cache miss for ${fileName}`);
        return null;
      }

      // Check TTL
      const stats = statSync(cachePath);
      const age = Date.now() - stats.mtimeMs;
      if (age > this.ttl) {
        console.log(`Cache expired for ${fileName} (age: ${(age / 1000 / 60 / 60).toFixed(1)}h)`);
        unlinkSync(cachePath);
        return null;
      }

      const cacheData = readFileSync(cachePath, 'utf-8');
      const entry: CacheEntry = JSON.parse(cacheData);

      console.log(`✓ Cache hit for ${fileName} (age: ${(age / 1000 / 60).toFixed(1)}min)`);
      return entry.result;

    } catch (error) {
      console.warn('Cache read error:', error);
      return null;
    }
  }

  /**
   * Store transcription result in cache
   */
  async set(
    fileBuffer: Buffer | ArrayBuffer,
    fileName: string,
    settings: { provider: string; model: string; language: string },
    result: VerboseTranscriptionResult
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const fileHash = this.calculateFileHash(fileBuffer);
      const settingsHash = this.calculateSettingsHash(settings);
      const cacheKey = `${fileHash}_${settingsHash}`;
      const cachePath = this.getCachePath(cacheKey);

      const entry: CacheEntry = {
        fileHash,
        settingsHash,
        result,
        timestamp: Date.now(),
        fileSize: fileBuffer.byteLength || (fileBuffer as Buffer).length,
        fileName
      };

      writeFileSync(cachePath, JSON.stringify(entry), 'utf-8');
      console.log(`Cached transcription result for ${fileName}`);

      // Check cache size and cleanup if needed
      await this.enforceCacheSize();

    } catch (error) {
      console.warn('Cache write error:', error);
    }
  }

  /**
   * Clear all cache entries
   */
  async clearAll(): Promise<void> {
    if (!this.enabled || !existsSync(this.cacheDir)) {
      return;
    }

    try {
      const files = readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          unlinkSync(join(this.cacheDir, file));
        }
      }
      console.log(`Cleared ${files.length} cache entries`);
    } catch (error) {
      console.warn('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    entryCount: number;
    totalSize: number;
    oldestEntry: number;
    newestEntry: number;
  }> {
    if (!this.enabled || !existsSync(this.cacheDir)) {
      return { entryCount: 0, totalSize: 0, oldestEntry: 0, newestEntry: 0 };
    }

    try {
      const files = readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
      let totalSize = 0;
      let oldestEntry = Date.now();
      let newestEntry = 0;

      for (const file of files) {
        const filePath = join(this.cacheDir, file);
        const stats = statSync(filePath);
        totalSize += stats.size;
        oldestEntry = Math.min(oldestEntry, stats.mtimeMs);
        newestEntry = Math.max(newestEntry, stats.mtimeMs);
      }

      return {
        entryCount: files.length,
        totalSize,
        oldestEntry,
        newestEntry
      };
    } catch (error) {
      console.warn('Cache stats error:', error);
      return { entryCount: 0, totalSize: 0, oldestEntry: 0, newestEntry: 0 };
    }
  }

  /**
   * Calculate file hash for cache key
   */
  private calculateFileHash(fileBuffer: Buffer | ArrayBuffer): string {
    const buffer = Buffer.isBuffer(fileBuffer)
      ? fileBuffer
      : Buffer.from(fileBuffer);

    return createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  /**
   * Calculate settings hash for cache key
   */
  private calculateSettingsHash(settings: {
    provider: string;
    model: string;
    language: string;
  }): string {
    const settingsString = JSON.stringify(settings);
    return createHash('md5').update(settingsString).digest('hex').substring(0, 8);
  }

  /**
   * Get cache file path for given key
   */
  private getCachePath(cacheKey: string): string {
    return join(this.cacheDir, `${cacheKey}.json`);
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
      console.log(`Created cache directory: ${this.cacheDir}`);
    }
  }

  /**
   * Remove expired cache entries
   */
  private cleanupExpiredEntries(): void {
    if (!existsSync(this.cacheDir)) {
      return;
    }

    try {
      const files = readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
      let removedCount = 0;

      for (const file of files) {
        const filePath = join(this.cacheDir, file);
        const stats = statSync(filePath);
        const age = Date.now() - stats.mtimeMs;

        if (age > this.ttl) {
          unlinkSync(filePath);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} expired cache entries`);
      }
    } catch (error) {
      console.warn('Cache cleanup error:', error);
    }
  }

  /**
   * Enforce maximum cache size by removing oldest entries
   */
  private async enforceCacheSize(): Promise<void> {
    if (!existsSync(this.cacheDir)) {
      return;
    }

    try {
      const files = readdirSync(this.cacheDir).filter(f => f.endsWith('.json'));
      const fileStats = files.map(file => ({
        path: join(this.cacheDir, file),
        stats: statSync(join(this.cacheDir, file))
      }));

      // Calculate total size
      const totalSize = fileStats.reduce((sum, f) => sum + f.stats.size, 0);

      if (totalSize <= this.maxCacheSize) {
        return;
      }

      // Sort by modification time (oldest first)
      fileStats.sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs);

      // Remove oldest entries until under limit
      let currentSize = totalSize;
      let removedCount = 0;

      for (const file of fileStats) {
        if (currentSize <= this.maxCacheSize) {
          break;
        }

        unlinkSync(file.path);
        currentSize -= file.stats.size;
        removedCount++;
      }

      console.log(`Removed ${removedCount} old cache entries to enforce size limit`);
    } catch (error) {
      console.warn('Cache size enforcement error:', error);
    }
  }
}
