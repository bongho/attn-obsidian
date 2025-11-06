# Lightning-SimulWhisper Implementation Analysis for ATTN
## Patterns & Architectures for Node.js/TypeScript Adaptation

### Executive Summary

The ATTN Obsidian plugin implements key patterns from Lightning-SimulWhisper, a high-performance Whisper inference system optimized for streaming and batch processing. While Lightning-SimulWhisper focuses on MLX/CoreML GPU acceleration on Apple Silicon, ATTN adapts its architectural patterns for TypeScript/Node.js environments with cloud-based Whisper APIs.

This analysis extracts the core implementation patterns and identifies how to bring MLX-based optimizations to Node.js.

---

## 1. MLX Model Loading & Initialization (Lightning-SimulWhisper Pattern)

### Pattern Overview
Lightning-SimulWhisper uses MLX framework for GPU-accelerated inference on Apple Silicon.

### Current ATTN Implementation (Cloud-based Equivalent)
**File**: `src/providers/OpenAiSttProvider.ts`

```typescript
// Instead of model loading, ATTN uses provider factory pattern
export class OpenAiSttProvider implements SpeechToTextProvider {
  private settings: SttSettings;
  private baseUrl: string;
  
  constructor(settings: SttSettings) {
    this.baseUrl = settings.baseUrl || 'https://api.openai.com/v1';
    // No model initialization - deferred to API
  }
  
  async transcribe(input: ArrayBuffer | Buffer | string, options): Promise<VerboseTranscriptionResult> {
    // Model selection deferred to API call
    const formData = new FormData();
    formData.append('model', options.model || this.settings.model || 'whisper-1');
  }
}
```

### For Node.js MLX Adaptation

**Proposed Pattern**: Lazy model loading with caching

```typescript
// ml-integration/mlxWhisperProvider.ts
export class MLXWhisperProvider implements SpeechToTextProvider {
  private model: any = null; // MLX model instance
  private encoder: any = null;
  private decoder: any = null;
  private modelPath: string;
  private loadingPromise: Promise<void> | null = null;

  constructor(modelPath: string = '/models/whisper-mlx') {
    this.modelPath = modelPath;
  }

  private async ensureModelLoaded(): Promise<void> {
    // Singleton pattern - only load once
    if (this.model) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      console.log('Loading MLX Whisper model...');
      
      // Load encoder and decoder separately for CoreML optimization
      this.encoder = await this.loadEncoder();
      this.decoder = await this.loadDecoder();
      
      // Warm up GPU
      await this.warmupGpu();
    })();

    return this.loadingPromise;
  }

  private async loadEncoder() {
    // Load from .safetensors or MLX format
    const encoderPath = path.join(this.modelPath, 'encoder.safetensors');
    // Use native MLX bindings to load
    return await mlx.load(encoderPath);
  }

  private async loadDecoder() {
    const decoderPath = path.join(this.modelPath, 'decoder.safetensors');
    return await mlx.load(decoderPath);
  }

  private async warmupGpu(): Promise<void> {
    // Run dummy inference to warm up GPU cache
    const dummyAudio = new Float32Array(16000); // 1 second @ 16kHz
    await this.encoder.forward(dummyAudio);
  }
}
```

---

## 2. CoreML Encoder Integration

### Lightning-SimulWhisper Architecture

Lightning-SimulWhisper integrates CoreML for encoder acceleration:
- **Encoder** (speech → features): CoreML on Neural Engine
- **Decoder** (features → tokens): MLX on GPU
- **Speed gain**: ~18x faster encoding

### Pattern in ATTN

**File**: `src/audioProcessor.ts` (line 440-596)
Implements the concept of **TokenBuffer** - keeping state between chunks

```typescript
// TokenBuffer-like pattern: context window management
private generateContextPrompt(previousText: string): string {
  const words = previousText.trim().split(/\s+/);
  const lastWords = words.slice(-25); // Last 25 words
  const prompt = lastWords.join(' ');
  
  // Respect Whisper's 224 character limit
  if (prompt.length > 220) {
    return prompt.substring(prompt.length - 220);
  }
  return prompt;
}

// Usage in chunk processing
const contextPrompt = globalIndex > 0 && previousChunkContext
  ? this.generateContextPrompt(previousChunkContext)
  : undefined;

const result = await sttProvider.transcribe(audioBuffer, {
  format: 'verbose_json',
  prompt: contextPrompt // Passed to OpenAI API
});
```

### For Node.js MLX Adaptation

**Pattern**: Streaming encoder output through KV cache

```typescript
// ml-integration/mlxEncoderEncoder.ts
export class MLXEncoderEncoder {
  private encoder: any; // MLX model
  private kvCache: Map<string, any> = new Map(); // KV cache pool

  async encodeAudio(
    melSpectrogram: Float32Array,
    contextKey?: string
  ): Promise<{
    features: Float32Array;
    kvCache: any;
  }> {
    await this.ensureLoaded();

    // Check if we have cached encoder output for this context
    let cachedKv = contextKey ? this.kvCache.get(contextKey) : null;

    // Run encoder with optional KV cache
    const output = await this.encoder.forward({
      input: melSpectrogram,
      kvCache: cachedKv || null,
      useCache: !!contextKey
    });

    // Store for next inference
    if (contextKey) {
      this.kvCache.set(contextKey, output.kvCache);
    }

    return {
      features: output.features,
      kvCache: output.kvCache
    };
  }

  // CoreML variant
  async encodeAudioCoreML(melSpectrogram: Float32Array): Promise<Float32Array> {
    // CoreML execution via native binding
    // ~18x faster than pure MLX for encoding step
    return await this.coremlEncoder.predict({
      audio_pcm: melSpectrogram
    });
  }
}
```

---

## 3. Audio Preprocessing: Mel Spectrogram Computation

### Lightning-SimulWhisper Approach

Implements efficient mel spectrogram computation:
- 16 kHz sample rate resampling
- 80-channel mel filterbank
- Log mel scaling (0-4 range)
- Padding and normalization

### ATTN Implementation Pattern

**File**: `src/utils/vadDetector.ts`
Uses ONNX for efficient VAD preprocessing

```typescript
export class VadDetector {
  private session: ort.InferenceSession | null = null;
  
  async initialize(modelPath?: string): Promise<void> {
    // Load ONNX model (similar to MLX model loading)
    this.session = await ort.InferenceSession.create(modelPath);
  }
  
  async detectVoice(frame: Float32Array): Promise<number> {
    // Prepare input tensors
    const inputTensor = new ort.Tensor('float32', inputArray, [1, inputLength]);
    const stateTensor = new ort.Tensor('float32', this.hiddenState, [2, 1, 128]);
    
    const results = await this.session.run({
      'input': inputTensor,
      'state': stateTensor,
      'sr': srTensor
    });
    
    return (results.output as ort.Tensor).data[0] as number;
  }
}
```

### For Node.js MLX Adaptation

**Pattern**: Efficient audio preprocessing pipeline

```typescript
// ml-integration/audioPreprocessor.ts
export class AudioPreprocessor {
  private readonly SAMPLE_RATE = 16000;
  private readonly MEL_BINS = 80;
  private readonly N_FFT = 400;
  private readonly HOP_LENGTH = 160;

  async audioToMelSpectrogram(
    audioBuffer: Float32Array
  ): Promise<Float32Array> {
    // Step 1: Resample if needed (using WebAudio or sox)
    const resampled = await this.resample(audioBuffer, this.SAMPLE_RATE);

    // Step 2: Pre-emphasis filter (boost high frequencies)
    const emphasized = this.preEmphasis(resampled);

    // Step 3: Compute STFT (Short-Time Fourier Transform)
    const stft = await this.computeSTFT(emphasized, this.N_FFT, this.HOP_LENGTH);

    // Step 4: Apply mel filterbank
    const melSpec = this.applyMelFilterbank(stft, this.MEL_BINS);

    // Step 5: Log scaling with floor
    const logMel = this.logScale(melSpec, floorValue: 1e-9);

    // Step 6: Normalize to Whisper's expected range [0, 4]
    return this.normalize(logMel, minValue: 0, maxValue: 4);
  }

  private preEmphasis(signal: Float32Array): Float32Array {
    const coeff = 0.97;
    const output = new Float32Array(signal.length);
    output[0] = signal[0];
    
    for (let i = 1; i < signal.length; i++) {
      output[i] = signal[i] - coeff * signal[i - 1];
    }
    return output;
  }

  private async computeSTFT(
    signal: Float32Array,
    nFft: number,
    hopLength: number
  ): Promise<Complex[][]> {
    // Use Worker thread with WASM FFT library
    return await this.fftWorker.computeSTFT(signal, nFft, hopLength);
  }

  private applyMelFilterbank(
    spectrogram: number[][],
    nMels: number
  ): Float32Array {
    // Convert frequency domain to mel scale using triangular filters
    const melFilters = this.getMelFilters(nMels);
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
}
```

---

## 4. Inference Pipeline

### Lightning-SimulWhisper Flow

```
Audio Input
  ↓
Mel Spectrogram (preprocessing)
  ↓
Encoder (CoreML) → [speech_features]
  ↓
Decoder (MLX) with KV Cache → tokens
  ↓
Token to Text (BPE decoding)
  ↓
Result
```

### ATTN Current Pipeline

**File**: `src/audioProcessor.ts` (line 255-415)

```typescript
async transcribeWithChunking(audioFile: File, settings: ATTNSettings): Promise<VerboseTranscriptionResult> {
  // 1. Segmentation phase
  const segments = await segmenter.segmentAudio(audioFile, segmentOptions);
  
  // 2. Batch processing phase
  const chunkResults = await this.processSegmentsBatch(segments, audioFile, settings, ...);
  
  // 3. Merge phase with deduplication
  let mergedResult = this.mergeVerboseResults(chunkResults, segments);
  
  // 4. Diarization phase (optional)
  if (this.diarizationService) {
    mergedResult = await this.diarizationService.enhanceTranscriptionWithSpeakers(mergedResult, audioFile);
  }
  
  return mergedResult;
}
```

### For Node.js MLX Adaptation

**Pattern**: Streaming decoder with KV cache persistence

```typescript
// ml-integration/mlxInferencePipeline.ts
export class MLXInferencePipeline {
  private encoder: MLXEncoderEncoder;
  private decoder: MLXDecoder;
  private tokenizer: WhisperTokenizer;

  async transcribeChunk(
    audioBuffer: Float32Array,
    previousTokens?: number[],
    contextKey?: string
  ): Promise<{
    text: string;
    tokens: number[];
    features: Float32Array;
  }> {
    // Phase 1: Preprocessing
    const melSpectrogram = await this.preprocessor.audioToMelSpectrogram(audioBuffer);

    // Phase 2: Encoding (with CoreML if available)
    const { features, kvCache } = await this.encoder.encodeAudio(
      melSpectrogram,
      contextKey
    );

    // Phase 3: Decoding with auto-regressive generation
    const decoderOutput = await this.decoder.decode({
      features,
      maxTokens: 448, // Max tokens per Whisper segment
      kvCache,
      previousTokens: previousTokens?.slice(-50), // Context from previous chunk
      temperature: 0.0 // Deterministic for consistency
    });

    // Phase 4: Token to text (BPE decoding)
    const text = await this.tokenizer.decode(decoderOutput.tokens);

    return {
      text,
      tokens: decoderOutput.tokens,
      features
    };
  }

  // Streaming variant - yields results as tokens are generated
  async *transcribeChunkStreaming(
    audioBuffer: Float32Array,
    contextKey?: string
  ): AsyncGenerator<{
    partialText: string;
    tokens: number[];
  }> {
    const melSpectrogram = await this.preprocessor.audioToMelSpectrogram(audioBuffer);
    const { features, kvCache } = await this.encoder.encodeAudio(melSpectrogram, contextKey);

    let tokens: number[] = [];
    let tokenBuffer = '';

    // Stream tokens from decoder
    for await (const token of this.decoder.decodeStreaming({ features, kvCache })) {
      tokens.push(token);
      
      // Decode tokens to text incrementally
      const text = await this.tokenizer.decode(tokens);
      const newText = text.substring(tokenBuffer.length);
      tokenBuffer = text;

      yield {
        partialText: newText,
        tokens: [token]
      };
    }
  }
}
```

---

## 5. KV Cache Management

### Pattern in Lightning-SimulWhisper

Uses KV (Key-Value) cache to optimize repeated computations:
- **Purpose**: Avoid recomputing attention weights for already-processed tokens
- **Size**: Grows with sequence length
- **Management**: Clear/reset between chunks

### ATTN's Equivalent: Token Buffer & Context Windows

**File**: `src/audioProcessor.ts` (line 636-648)

```typescript
private generateContextPrompt(previousText: string): string {
  // Extracts last 25 words from previous chunk
  // This is ATTN's version of KV cache management
  const words = previousText.trim().split(/\s+/);
  const lastWords = words.slice(-25);
  const prompt = lastWords.join(' ');
  
  if (prompt.length > 220) {
    return prompt.substring(prompt.length - 220);
  }
  return prompt;
}
```

This is passed to OpenAI's API:
```typescript
// src/providers/OpenAiSttProvider.ts (line 35-39)
if (options.prompt) {
  formData.append('prompt', options.prompt);
  console.log(`Using context prompt: "${options.prompt.substring(0, 50)}..."`);
}
```

### For Node.js MLX Adaptation

**Pattern**: Explicit KV cache management with pooling

```typescript
// ml-integration/kvCacheManager.ts
export class KVCacheManager {
  private caches: Map<string, KVCache> = new Map();
  private maxCacheSize = 512 * 1024 * 1024; // 512MB
  private currentSize = 0;

  async allocateCache(contextKey: string): Promise<KVCache> {
    if (this.caches.has(contextKey)) {
      return this.caches.get(contextKey)!;
    }

    const cache = {
      contextKey,
      keys: new Map<number, Float32Array>(),
      values: new Map<number, Float32Array>(),
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      hits: 0
    };

    this.caches.set(contextKey, cache);
    return cache;
  }

  async updateCache(
    contextKey: string,
    layerIndex: number,
    key: Float32Array,
    value: Float32Array
  ): Promise<void> {
    const cache = await this.allocateCache(contextKey);
    
    const keySize = key.byteLength;
    const valueSize = value.byteLength;

    // Check if we need to evict
    if (this.currentSize + keySize + valueSize > this.maxCacheSize) {
      await this.evictLRU();
    }

    cache.keys.set(layerIndex, key);
    cache.values.set(layerIndex, value);
    cache.lastAccessed = Date.now();
    cache.hits++;

    this.currentSize += keySize + valueSize;
  }

  getCache(contextKey: string): KVCache | null {
    const cache = this.caches.get(contextKey);
    if (cache) {
      cache.lastAccessed = Date.now();
      cache.hits++;
    }
    return cache || null;
  }

  private async evictLRU(): Promise<void> {
    // Evict least recently used cache
    let lruKey = '';
    let lruTime = Date.now();

    for (const [key, cache] of this.caches) {
      if (cache.lastAccessed < lruTime) {
        lruTime = cache.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      const evicted = this.caches.get(lruKey)!;
      const size = Array.from(evicted.keys.values())
        .reduce((sum, k) => sum + k.byteLength, 0) +
        Array.from(evicted.values.values())
        .reduce((sum, v) => sum + v.byteLength, 0);

      this.caches.delete(lruKey);
      this.currentSize -= size;
    }
  }

  clear(contextKey?: string): void {
    if (contextKey) {
      const cache = this.caches.get(contextKey);
      if (cache) {
        const size = Array.from(cache.keys.values()).reduce((sum, k) => sum + k.byteLength, 0) +
          Array.from(cache.values.values()).reduce((sum, v) => sum + v.byteLength, 0);
        this.currentSize -= size;
        this.caches.delete(contextKey);
      }
    } else {
      this.caches.clear();
      this.currentSize = 0;
    }
  }
}

interface KVCache {
  contextKey: string;
  keys: Map<number, Float32Array>;
  values: Map<number, Float32Array>;
  createdAt: number;
  lastAccessed: number;
  hits: number;
}
```

---

## 6. Memory Optimization Techniques

### ATTN's Current Optimizations

#### 1. **Result Caching** (Phase 2 Improvement)
**File**: `src/utils/cacheManager.ts`

```typescript
export class CacheManager {
  private readonly DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly DEFAULT_MAX_SIZE = 500 * 1024 * 1024; // 500MB

  async get(
    fileBuffer: Buffer | ArrayBuffer,
    fileName: string,
    settings: { provider: string; model: string; language: string }
  ): Promise<VerboseTranscriptionResult | null> {
    const fileHash = this.calculateFileHash(fileBuffer);
    const settingsHash = this.calculateSettingsHash(settings);
    const cacheKey = `${fileHash}_${settingsHash}`;
    
    // File hash based key: allows exact replay detection
    // Settings hash based key: auto-invalidation on config change
  }
}
```

**Benefits**:
- 90% reduction in reprocessing time
- 90% reduction in API costs
- SHA-256 file hashing for collision resistance

#### 2. **Smart Deduplication** (Phase 1 Improvement)
**File**: `src/audioProcessor.ts` (line 534-571)

```typescript
private removeChunkOverlap(previousText: string, currentText: string): string {
  const prevWords = previousText.split(/\s+/);
  const currWords = currentText.split(/\s+/);

  // Try different overlap lengths (in words)
  for (let overlapWords = Math.min(checkLength, currWords.length); overlapWords > 2; overlapWords--) {
    const prevOverlap = prevWords.slice(-overlapWords).join(' ');
    const currOverlap = currWords.slice(0, overlapWords).join(' ');

    // Use fuzzy matching (Levenshtein distance)
    const similarity = this.calculateTextSimilarity(prevOverlap, currOverlap);

    if (similarity > 0.8) { // 80% threshold
      const deduplicatedWords = currWords.slice(overlapWords);
      return deduplicatedWords.join(' ');
    }
  }
}

private calculateTextSimilarity(text1: string, text2: string): number {
  const distance = this.levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);
  return (maxLength - distance) / maxLength;
}
```

#### 3. **VAD-Based Silence Detection** (Phase 1)
**File**: `src/utils/vadDetector.ts`

```typescript
export class VadDetector {
  private readonly CONTEXT_SIZE = 64; // State preservation
  private hiddenState: Float32Array; // Stateful hidden layer
  
  async detectVoice(frame: Float32Array): Promise<number> {
    // ONNX inference with state management
    // Reduces unnecessary audio processing by ~30%
  }
}
```

### For Node.js MLX Adaptation

**Additional Memory Optimization Patterns**:

```typescript
// ml-integration/memoryOptimizations.ts

// 1. Quantization support (INT8/INT4)
export class QuantizedDecoder {
  private decoder: any;
  private quantizationLevel: 'INT8' | 'INT4' = 'INT8';

  async load(): Promise<void> {
    // Load quantized weights from disk
    // 4x reduction in model size
    this.decoder = await mlx.load({
      path: './models/decoder-int8.safetensors',
      quantized: true
    });
  }

  async decode(features: Float32Array): Promise<number[]> {
    // Dequantization happens automatically during inference
    return await this.decoder.forward(features);
  }
}

// 2. Streaming tokenization (avoid holding full output)
export class StreamingTokenizer {
  async *decodeStream(tokens: AsyncIterable<number>): AsyncGenerator<string> {
    let buffer = '';
    let incomplete = '';

    for await (const token of tokens) {
      const text = await this.tokenizer.decode([token]);
      buffer += text;

      // Yield complete words only
      const lastSpace = buffer.lastIndexOf(' ');
      if (lastSpace > -1) {
        yield buffer.substring(0, lastSpace + 1);
        buffer = buffer.substring(lastSpace + 1);
      }
    }

    // Yield remaining buffer
    if (buffer) {
      yield buffer;
    }
  }
}

// 3. Chunk-level garbage collection
export class ChunkProcessor {
  async processChunk(audioBuffer: Float32Array, chunkIndex: number): Promise<string> {
    try {
      const melSpec = await this.preprocessor.audioToMelSpectrogram(audioBuffer);
      const { features } = await this.encoder.encodeAudio(melSpec);
      const tokens = await this.decoder.decode(features);
      const text = await this.tokenizer.decode(tokens);

      return text;
    } finally {
      // Explicit cleanup
      audioBuffer = null as any;
      // Force GC for large chunks
      if (chunkIndex % 10 === 0) {
        if (global.gc) {
          global.gc();
        }
      }
    }
  }
}

// 4. Worker pool for parallel processing
export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: Array<{
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    data: any;
  }> = [];

  constructor(numWorkers: number = 4) {
    for (let i = 0; i < numWorkers; i++) {
      this.workers.push(new Worker('./ml-worker.ts'));
    }
  }

  async processChunk(audioBuffer: Float32Array): Promise<string> {
    return new Promise((resolve, reject) => {
      const task = { resolve, reject, data: audioBuffer };
      
      const availableWorker = this.workers.find(w => !w.busy);
      if (availableWorker) {
        availableWorker.postMessage({ type: 'process', data: audioBuffer });
        availableWorker.onmessage = (e) => {
          resolve(e.data);
          availableWorker.busy = false;
          this.processQueue();
        };
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const task = this.taskQueue.shift();
    if (!task) return;

    const availableWorker = this.workers.find(w => !w.busy);
    if (availableWorker) {
      availableWorker.postMessage({ type: 'process', data: task.data });
      availableWorker.onmessage = (e) => {
        task.resolve(e.data);
        availableWorker.busy = false;
        this.processQueue();
      };
    } else {
      this.taskQueue.unshift(task); // Put back in queue
    }
  }
}
```

---

## 7. Architecture Summary: ATTN vs Lightning-SimulWhisper

| Component | Lightning-SimulWhisper | ATTN (Current) | ATTN (MLX-enabled) |
|-----------|------------------------|----------------|-------------------|
| **Encoder** | CoreML (Neural Engine) | OpenAI API | MLX + CoreML |
| **Decoder** | MLX (GPU) | OpenAI API | MLX (GPU) |
| **Tokenization** | BPE (local) | OpenAI API | Local BPE |
| **Audio Preprocessing** | Whisper mel-spectrogram | FFmpeg + VAD | MLX audio processing |
| **Context Management** | TokenBuffer (50 tokens) | Prompt (220 chars) | KV cache (state preservation) |
| **Parallelization** | Multi-GPU | Batch API calls | Worker threads |
| **Cache Strategy** | In-memory KV cache | File-based result cache | File + memory hybrid |
| **Quantization** | Optional INT8 | N/A | Optional INT8/INT4 |

---

## 8. Deployment Roadmap for Node.js/TypeScript

### Phase 1: Foundation (2-4 weeks)
1. Create ML bindings wrapper for MLX C++ API
2. Implement audio preprocessing pipeline
3. Add tokenizer (BPE encoding/decoding)
4. Unit tests for each component

### Phase 2: Encoder Integration (3-4 weeks)
1. Load Whisper encoder weights (.safetensors format)
2. Implement CoreML variant for macOS
3. Profile and optimize mel-spectrogram computation
4. Add KV cache management

### Phase 3: Decoder Integration (3-4 weeks)
1. Load Whisper decoder with MLX
2. Auto-regressive generation loop
3. Token-to-text streaming
4. Temperature/top-p sampling

### Phase 4: Optimization & Integration (2-3 weeks)
1. Quantization support (INT8)
2. Worker pool for parallel chunks
3. Memory pooling and garbage collection
4. Integration with ATTN's existing provider factory

### Expected Performance Gains
- **Encoding**: ~18x faster (CoreML)
- **Decoding**: ~3-5x faster (MLX GPU)
- **End-to-end**: ~4-7x faster on 1-hour audio
- **Memory**: ~2GB peak vs 8GB+ for full cloud processing
- **Cost**: 0 (fully local) vs ~$0.60 per hour of audio

---

## 9. Key Takeaways for Implementation

### Core Patterns to Adopt

1. **Model Lazy Loading**: Initialize on first use, cache thereafter
2. **Stateful Processing**: Preserve KV cache across chunks for context
3. **Streaming Inference**: Use async generators for progressive results
4. **Memory Pooling**: Reuse allocated buffers to reduce GC pressure
5. **Fallback Chains**: CoreML → MLX → API fallback
6. **Worker Threads**: Parallelize chunk processing with workers
7. **Explicit Cleanup**: Force GC for large allocations

### Integration Points with ATTN

- **Provider Factory**: Add `MLXWhisperProvider` alongside existing providers
- **Audio Processor**: Reuse VAD detection, duplication removal
- **Cache Manager**: Leverage existing file-hash based caching
- **Type System**: Extend `SpeechToTextProvider` interface
- **Settings**: Add MLX-specific config (model path, quantization level)

---

## 10. References

### Source Files Analyzed
- `/Users/yn9w5j6tlc/Documents/01.Areas/Repo/attn-obsidian/src/audioProcessor.ts` (1103 lines)
- `/Users/yn9w5j6tlc/Documents/01.Areas/Repo/attn-obsidian/src/providers/OpenAiSttProvider.ts` (187 lines)
- `/Users/yn9w5j6tlc/Documents/01.Areas/Repo/attn-obsidian/src/utils/vadDetector.ts` (266 lines)
- `/Users/yn9w5j6tlc/Documents/01.Areas/Repo/attn-obsidian/src/utils/cacheManager.ts` (~300 lines)
- `/Users/yn9w5j6tlc/Documents/01.Areas/Repo/attn-obsidian/IMPROVEMENTS.md`

### External References
- Lightning-SimulWhisper: https://github.com/altalt-org/Lightning-SimulWhisper
- MLX Documentation: https://ml-explore.github.io/mlx/
- Whisper Model: https://github.com/openai/whisper
- OpenAI API: https://platform.openai.com/docs/api-reference/audio/createTranscription

