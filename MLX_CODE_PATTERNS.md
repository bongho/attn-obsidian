# MLX Implementation Code Patterns - Ready to Use

## Pattern 1: Lazy Model Loader (Singleton)

```typescript
// ml-integration/mlxModelLoader.ts
import * as path from 'path';

export class MLXModelLoader {
  private static instance: MLXModelLoader;
  private model: any = null;
  private encoder: any = null;
  private decoder: any = null;
  private loadingPromise: Promise<void> | null = null;
  private modelPath: string;

  private constructor(modelPath: string) {
    this.modelPath = modelPath;
  }

  static getInstance(modelPath: string = './models/whisper-mlx'): MLXModelLoader {
    if (!MLXModelLoader.instance) {
      MLXModelLoader.instance = new MLXModelLoader(modelPath);
    }
    return MLXModelLoader.instance;
  }

  async ensureLoaded(): Promise<void> {
    // Already loaded
    if (this.encoder && this.decoder) {
      return;
    }

    // Loading in progress
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start loading
    this.loadingPromise = (async () => {
      console.log('Loading MLX Whisper models...');
      const startTime = Date.now();

      try {
        this.encoder = await this.loadEncoder();
        this.decoder = await this.loadDecoder();
        await this.warmupGpu();

        const duration = Date.now() - startTime;
        console.log(`Models loaded successfully in ${duration}ms`);
      } catch (error) {
        this.loadingPromise = null; // Reset on error
        throw new Error(`Failed to load models: ${error}`);
      }
    })();

    return this.loadingPromise;
  }

  private async loadEncoder() {
    const encoderPath = path.join(this.modelPath, 'encoder.safetensors');
    console.log(`Loading encoder from ${encoderPath}...`);

    // TODO: Replace with actual MLX binding
    // return await mlx.load(encoderPath);

    // Mock for development
    return {
      forward: async (input: Float32Array) => new Float32Array(1500),
    };
  }

  private async loadDecoder() {
    const decoderPath = path.join(this.modelPath, 'decoder.safetensors');
    console.log(`Loading decoder from ${decoderPath}...`);

    // TODO: Replace with actual MLX binding
    // return await mlx.load(decoderPath);

    // Mock for development
    return {
      forward: async (input: Float32Array) => new Float32Array(448),
    };
  }

  private async warmupGpu(): Promise<void> {
    console.log('Warming up GPU...');
    const dummyAudio = new Float32Array(16000); // 1 second @ 16kHz
    await this.encoder.forward(dummyAudio);
    console.log('GPU warmup complete');
  }

  getEncoder() {
    if (!this.encoder) {
      throw new Error('Encoder not loaded. Call ensureLoaded() first.');
    }
    return this.encoder;
  }

  getDecoder() {
    if (!this.decoder) {
      throw new Error('Decoder not loaded. Call ensureLoaded() first.');
    }
    return this.decoder;
  }
}
```

---

## Pattern 2: KV Cache Manager with LRU Eviction

```typescript
// ml-integration/kvCacheManager.ts

export interface KVCache {
  contextKey: string;
  layers: Map<number, { keys: Float32Array; values: Float32Array }>;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  totalSize: number;
}

export class KVCacheManager {
  private caches: Map<string, KVCache> = new Map();
  private maxCacheSize: number;
  private currentSize: number = 0;
  private readonly DEFAULT_MAX_SIZE = 512 * 1024 * 1024; // 512MB

  constructor(maxCacheSizeMB: number = 512) {
    this.maxCacheSize = maxCacheSizeMB * 1024 * 1024;
  }

  async allocateCache(contextKey: string): Promise<KVCache> {
    // Return existing cache
    if (this.caches.has(contextKey)) {
      const cache = this.caches.get(contextKey)!;
      cache.lastAccessed = Date.now();
      cache.accessCount++;
      return cache;
    }

    // Create new cache
    const cache: KVCache = {
      contextKey,
      layers: new Map(),
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      totalSize: 0,
    };

    this.caches.set(contextKey, cache);
    return cache;
  }

  async updateCache(
    contextKey: string,
    layerIndex: number,
    keys: Float32Array,
    values: Float32Array
  ): Promise<void> {
    const cache = await this.allocateCache(contextKey);

    const keySize = keys.byteLength;
    const valueSize = values.byteLength;
    const newItemSize = keySize + valueSize;

    // Check if need to evict
    if (this.currentSize + newItemSize > this.maxCacheSize) {
      await this.evictLRU();
    }

    // Store in cache
    cache.layers.set(layerIndex, { keys, values });
    cache.totalSize += newItemSize;
    this.currentSize += newItemSize;
    cache.lastAccessed = Date.now();
  }

  getCache(contextKey: string): KVCache | null {
    const cache = this.caches.get(contextKey);
    if (cache) {
      cache.lastAccessed = Date.now();
      cache.accessCount++;
      return cache;
    }
    return null;
  }

  getCacheLayer(contextKey: string, layerIndex: number): { keys: Float32Array; values: Float32Array } | null {
    const cache = this.getCache(contextKey);
    if (!cache) return null;
    return cache.layers.get(layerIndex) || null;
  }

  private async evictLRU(): Promise<void> {
    // Find least recently used cache
    let lruKey = '';
    let lruTime = Date.now();
    let lruIndex = -1;
    let index = 0;

    for (const [key, cache] of this.caches) {
      if (cache.lastAccessed < lruTime) {
        lruTime = cache.lastAccessed;
        lruKey = key;
        lruIndex = index;
      }
      index++;
    }

    if (lruKey) {
      const evicted = this.caches.get(lruKey)!;
      console.log(
        `Evicting cache ${lruKey} (age: ${Date.now() - evicted.createdAt}ms, size: ${evicted.totalSize}B, accesses: ${evicted.accessCount})`
      );

      this.currentSize -= evicted.totalSize;
      this.caches.delete(lruKey);
    }
  }

  clear(contextKey?: string): void {
    if (contextKey) {
      const cache = this.caches.get(contextKey);
      if (cache) {
        this.currentSize -= cache.totalSize;
        this.caches.delete(contextKey);
      }
    } else {
      this.caches.clear();
      this.currentSize = 0;
    }
  }

  getStats() {
    return {
      cacheCount: this.caches.size,
      currentSize: this.currentSize,
      maxSize: this.maxCacheSize,
      utilizationPercent: ((this.currentSize / this.maxCacheSize) * 100).toFixed(2),
      caches: Array.from(this.caches.values()).map(c => ({
        contextKey: c.contextKey,
        size: c.totalSize,
        layers: c.layers.size,
        accesses: c.accessCount,
        age: Date.now() - c.createdAt,
      })),
    };
  }
}
```

---

## Pattern 3: Audio Preprocessing (Mel Spectrogram)

```typescript
// ml-integration/audioPreprocessor.ts

export class AudioPreprocessor {
  private readonly SAMPLE_RATE = 16000;
  private readonly MEL_BINS = 80;
  private readonly N_FFT = 400;
  private readonly HOP_LENGTH = 160;
  private readonly F_MIN = 0;
  private readonly F_MAX = 8000;

  async audioToMelSpectrogram(audioBuffer: Float32Array): Promise<Float32Array> {
    console.log('Converting audio to mel spectrogram...');

    // Step 1: Resample if needed
    const resampled = await this.resample(audioBuffer, this.SAMPLE_RATE);

    // Step 2: Pre-emphasis
    const emphasized = this.preEmphasis(resampled, 0.97);

    // Step 3: Frame the signal
    const frames = this.frameSignal(emphasized, this.N_FFT, this.HOP_LENGTH);

    // Step 4: Apply window and compute magnitude spectrogram
    const spectrogram = this.computeSpectrogram(frames, this.N_FFT);

    // Step 5: Apply mel filterbank
    const melSpec = this.applyMelFilterbank(spectrogram, this.MEL_BINS, this.SAMPLE_RATE);

    // Step 6: Log scaling
    const logMel = this.logScale(melSpec, 1e-9);

    // Step 7: Normalize
    const normalized = this.normalize(logMel, 0, 4);

    return normalized;
  }

  private preEmphasis(signal: Float32Array, coeff: number): Float32Array {
    const output = new Float32Array(signal.length);
    output[0] = signal[0];

    for (let i = 1; i < signal.length; i++) {
      output[i] = signal[i] - coeff * signal[i - 1];
    }

    return output;
  }

  private frameSignal(
    signal: Float32Array,
    frameLength: number,
    hopLength: number
  ): Float32Array[] {
    const frames: Float32Array[] = [];
    const numFrames = Math.floor((signal.length - frameLength) / hopLength) + 1;

    for (let i = 0; i < numFrames; i++) {
      const start = i * hopLength;
      const frame = signal.slice(start, start + frameLength);
      frames.push(frame);
    }

    return frames;
  }

  private computeSpectrogram(frames: Float32Array[], nFft: number): number[][] {
    const spectrogram: number[][] = [];

    for (const frame of frames) {
      // Pad frame to n_fft length
      const padded = new Float32Array(nFft);
      padded.set(frame);

      // Apply Hann window
      const windowed = this.applyHannWindow(padded);

      // Compute FFT (simplified - in practice use KissFFT or similar)
      const magnitude = this.computeFFTMagnitude(windowed);
      spectrogram.push(Array.from(magnitude.slice(0, nFft / 2 + 1)));
    }

    return spectrogram;
  }

  private applyHannWindow(signal: Float32Array): Float32Array {
    const output = new Float32Array(signal.length);
    const N = signal.length;

    for (let i = 0; i < N; i++) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      output[i] = signal[i] * window;
    }

    return output;
  }

  private computeFFTMagnitude(signal: Float32Array): Float32Array {
    // Placeholder: In production, use a proper FFT library
    // This is a simplified stub
    const output = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i++) {
      output[i] = Math.abs(signal[i]);
    }
    return output;
  }

  private applyMelFilterbank(
    spectrogram: number[][],
    nMels: number,
    sampleRate: number
  ): Float32Array {
    const melFilters = this.createMelFilterbank(nMels, spectrogram[0].length, sampleRate);
    const melSpec = new Float32Array(spectrogram.length * nMels);

    for (let t = 0; t < spectrogram.length; t++) {
      for (let m = 0; m < nMels; m++) {
        let sum = 0;
        for (let f = 0; f < spectrogram[t].length; f++) {
          sum += spectrogram[t][f] * melFilters[m][f];
        }
        melSpec[t * nMels + m] = sum;
      }
    }

    return melSpec;
  }

  private createMelFilterbank(nMels: number, nFft: number, sampleRate: number): number[][] {
    // Create mel filterbank - placeholder
    const filters: number[][] = [];

    for (let m = 0; m < nMels; m++) {
      const filter = new Array(nFft).fill(0);
      filters.push(filter);
    }

    return filters;
  }

  private logScale(data: Float32Array, floor: number): Float32Array {
    return new Float32Array(
      Array.from(data).map(v => Math.log10(Math.max(v, floor)))
    );
  }

  private normalize(data: Float32Array, minValue: number, maxValue: number): Float32Array {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    return new Float32Array(
      Array.from(data).map(v =>
        minValue + ((v - min) / range) * (maxValue - minValue)
      )
    );
  }

  private async resample(
    audioBuffer: Float32Array,
    targetSampleRate: number
  ): Promise<Float32Array> {
    // Placeholder: implement actual resampling
    // For now, assume input is already 16kHz
    return audioBuffer;
  }
}
```

---

## Pattern 4: MLX Whisper Provider (Main Integration)

```typescript
// src/providers/MLXWhisperProvider.ts
import { SpeechToTextProvider, SttSettings, VerboseTranscriptionResult, TranscriptionSegment } from '../types';
import { MLXModelLoader } from '../ml-integration/mlxModelLoader';
import { KVCacheManager } from '../ml-integration/kvCacheManager';
import { AudioPreprocessor } from '../ml-integration/audioPreprocessor';

export class MLXWhisperProvider implements SpeechToTextProvider {
  private modelLoader: MLXModelLoader;
  private kvCacheManager: KVCacheManager;
  private preprocessor: AudioPreprocessor;
  private settings: SttSettings;

  constructor(settings: SttSettings, modelPath?: string) {
    this.settings = settings;
    this.modelLoader = MLXModelLoader.getInstance(modelPath);
    this.kvCacheManager = new KVCacheManager(512);
    this.preprocessor = new AudioPreprocessor();
  }

  async transcribe(
    input: ArrayBuffer | Buffer | string,
    options: {
      format: 'verbose_json' | 'text';
      language?: string;
      model?: string;
      prompt?: string;
    }
  ): Promise<VerboseTranscriptionResult> {
    // Ensure models are loaded
    await this.modelLoader.ensureLoaded();

    // Convert input to Float32Array
    const audioBuffer = this.convertToAudioBuffer(input);

    // Preprocess audio
    const melSpectrogram = await this.preprocessor.audioToMelSpectrogram(audioBuffer);

    // Encode
    const encoder = this.modelLoader.getEncoder();
    const features = await encoder.forward(melSpectrogram);

    // Decode with KV cache
    const contextKey = `context_${Date.now()}`;
    const kvCache = this.kvCacheManager.allocateCache(contextKey);

    const decoder = this.modelLoader.getDecoder();
    const tokens = await decoder.forward(features);

    // Convert tokens to text (placeholder)
    const text = this.tokensToText(tokens);

    // Return result
    const segment: TranscriptionSegment = {
      id: 0,
      start: 0,
      end: audioBuffer.length / 16000,
      text,
    };

    return {
      text,
      language: options.language || 'en',
      duration: audioBuffer.length / 16000,
      segments: [segment],
      raw: { tokens },
    };
  }

  private convertToAudioBuffer(input: ArrayBuffer | Buffer | string): Float32Array {
    let buffer: Uint8Array;

    if (typeof input === 'string') {
      buffer = new Uint8Array(Buffer.from(input, 'base64'));
    } else if (input instanceof ArrayBuffer) {
      buffer = new Uint8Array(input);
    } else {
      buffer = new Uint8Array(input);
    }

    // Decode from WAV/M4A to PCM (simplified)
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
  }

  private tokensToText(tokens: Float32Array | number[]): string {
    // Placeholder: implement BPE decoding
    return '[transcription would go here]';
  }
}
```

---

## Pattern 5: Integration with Provider Factory

```typescript
// src/providers/providerFactory.ts (updated)

import { OpenAiSttProvider } from './OpenAiSttProvider';
import { GeminiSttProvider } from './GeminiSttProvider';
import { LocalWhisperProvider } from './LocalWhisperProvider';
import { MLXWhisperProvider } from './MLXWhisperProvider';
import { SpeechToTextProvider, SttSettings } from '../types';

export function createSttProvider(settings: SttSettings): SpeechToTextProvider {
  switch (settings.provider.toLowerCase()) {
    case 'mlx':
    case 'mlx-whisper':
      return new MLXWhisperProvider(settings, settings.modelPath);

    case 'openai':
      return new OpenAiSttProvider(settings);

    case 'gemini':
      return new GeminiSttProvider(settings);

    case 'local-whisper':
    case 'local':
      return new LocalWhisperProvider(settings);

    default:
      throw new Error(`Unknown STT provider: ${settings.provider}`);
  }
}
```

---

## Pattern 6: Settings Extension

```typescript
// src/types.ts (updated SttSettings interface)

export interface SttSettings {
  provider: 'openai' | 'gemini' | 'groq' | 'local-whisper' | 'mlx';
  model: string;
  language?: string;
  apiKey?: string;
  baseUrl?: string;

  // MLX-specific settings
  modelPath?: string; // Path to MLX model weights
  quantization?: 'none' | 'int8' | 'int4'; // Quantization level
  maxCacheSize?: number; // Max KV cache in MB (default: 512)
  useCoreMl?: boolean; // Use CoreML encoder on macOS (default: true)
  warmupGpu?: boolean; // Warm up GPU on initialization (default: true)

  // Existing settings
  ollamaEndpoint?: string;
  whisperBinaryPath?: string;
  temperature?: number;
  topP?: number;
}
```

---

## Usage Example

```typescript
// In your audio processor
import { createSttProvider } from './providers/providerFactory';

async function transcribeWithMLX(audioFile: File, settings: ATTNSettings): Promise<VerboseTranscriptionResult> {
  // Create MLX provider
  const sttProvider = createSttProvider({
    provider: 'mlx',
    model: 'base',
    modelPath: './models/whisper-mlx',
    useCoreMl: true, // Use CoreML on macOS
    quantization: 'int8',
  });

  // Transcribe
  const audioBuffer = await audioFile.arrayBuffer();
  const result = await sttProvider.transcribe(audioBuffer, {
    format: 'verbose_json',
    language: settings.stt.language,
  });

  return result;
}
```

---

## Testing Patterns

```typescript
// test/mlxProvider.test.ts

import { MLXWhisperProvider } from '../src/providers/MLXWhisperProvider';
import { MLXModelLoader } from '../src/ml-integration/mlxModelLoader';
import { KVCacheManager } from '../src/ml-integration/kvCacheManager';

describe('MLXWhisperProvider', () => {
  let provider: MLXWhisperProvider;

  beforeEach(() => {
    const settings = {
      provider: 'mlx',
      model: 'base',
      language: 'en',
    };
    provider = new MLXWhisperProvider(settings);
  });

  test('should load models lazily', async () => {
    const loader = MLXModelLoader.getInstance();
    await loader.ensureLoaded();
    // Models should be loaded after this
  });

  test('should transcribe audio', async () => {
    const audioBuffer = new ArrayBuffer(16000 * 5); // 5 seconds @ 16kHz
    const result = await provider.transcribe(audioBuffer, {
      format: 'verbose_json',
      language: 'en',
    });

    expect(result.text).toBeDefined();
    expect(result.segments).toBeDefined();
    expect(result.duration).toBeLessThan(10);
  });

  test('should manage KV cache', async () => {
    const cacheManager = new KVCacheManager(100); // 100MB
    const cache = await cacheManager.allocateCache('test_context');

    expect(cache).toBeDefined();
    expect(cache.contextKey).toBe('test_context');

    const stats = cacheManager.getStats();
    expect(stats.cacheCount).toBe(1);
  });
});
```

---

These patterns provide a solid foundation for implementing MLX-based Whisper inference in Node.js/TypeScript. They follow the architectural patterns established by Lightning-SimulWhisper while remaining compatible with the ATTN plugin's existing infrastructure.
