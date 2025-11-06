/**
 * Silero VAD (Voice Activity Detection) Wrapper
 * Based on Lightning-SimulWhisper implementation
 *
 * Features:
 * - ONNX-based VAD for accurate speech detection
 * - Stateful processing with hidden state management
 * - Context window preservation (64 samples)
 * - Hysteresis for stable speech/silence transitions
 */

import * as ort from 'onnxruntime-node';
import * as path from 'path';

export interface VadConfig {
	/** Sample rate (8000 or 16000 Hz only) */
	sampleRate: 16000 | 8000;

	/** Voice probability threshold (0-1) */
	threshold: number;

	/** Minimum silence duration in ms to end speech segment */
	minSilenceDurationMs: number;

	/** Speech padding in ms (pre-trigger) */
	speechPadMs: number;

	/** Frame size in ms (default: 32ms) */
	frameSizeMs: number;
}

export interface VadSegment {
	/** Start time in seconds */
	start: number;

	/** End time in seconds */
	end: number;

	/** Confidence score (0-1) */
	confidence: number;
}

export class VadDetector {
	private session: ort.InferenceSession | null = null;
	private config: VadConfig;

	// State management (2, 1, 128) as per Silero VAD spec
	private hiddenState: Float32Array;

	// Context buffer (64 samples)
	private context: Float32Array;

	// Frame size in samples
	private frameSizeSamples: number;

	// Context size in samples
	private readonly CONTEXT_SIZE = 64;

	// Speech detection state
	private isSpeaking = false;
	private speechStartTime = 0;
	private silenceStartTime = 0;
	private lastProcessedTime = 0;

	constructor(config: Partial<VadConfig> = {}) {
		this.config = {
			sampleRate: 16000,
			threshold: 0.5,
			minSilenceDurationMs: 500,
			speechPadMs: 100,
			frameSizeMs: 32,
			...config
		};

		// Validate sample rate
		if (this.config.sampleRate !== 16000 && this.config.sampleRate !== 8000) {
			throw new Error('Sample rate must be 8000 or 16000 Hz');
		}

		// Calculate frame size in samples
		this.frameSizeSamples = Math.floor(
			(this.config.sampleRate * this.config.frameSizeMs) / 1000
		);

		// Initialize state
		this.hiddenState = new Float32Array(2 * 1 * 128).fill(0);
		this.context = new Float32Array(this.CONTEXT_SIZE).fill(0);
	}

	/**
	 * Initialize VAD model
	 */
	async initialize(modelPath?: string): Promise<void> {
		if (!modelPath) {
			// Default model path
			modelPath = path.join(__dirname, '../../models/silero_vad.onnx');
		}

		try {
			this.session = await ort.InferenceSession.create(modelPath);
			console.log('Silero VAD model loaded successfully');
		} catch (error) {
			throw new Error(`Failed to load VAD model: ${error}`);
		}
	}

	/**
	 * Process audio buffer and detect speech segments
	 */
	async processAudio(audioBuffer: Float32Array): Promise<VadSegment[]> {
		if (!this.session) {
			throw new Error('VAD model not initialized. Call initialize() first.');
		}

		const segments: VadSegment[] = [];
		const numFrames = Math.floor(audioBuffer.length / this.frameSizeSamples);

		for (let i = 0; i < numFrames; i++) {
			const frameStart = i * this.frameSizeSamples;
			const frameEnd = frameStart + this.frameSizeSamples;
			const frame = audioBuffer.slice(frameStart, frameEnd);

			const currentTime = frameStart / this.config.sampleRate;

			// Run VAD inference
			const probability = await this.detectVoice(frame);

			// Determine threshold with hysteresis (as per Lightning implementation)
			const effectiveThreshold = this.isSpeaking
				? this.config.threshold - 0.15
				: this.config.threshold;

			if (probability >= effectiveThreshold) {
				// Voice detected
				if (!this.isSpeaking) {
					// Speech started
					this.isSpeaking = true;
					this.speechStartTime = Math.max(
						0,
						currentTime - (this.config.speechPadMs / 1000)
					);
				}
				this.silenceStartTime = 0; // Reset silence timer
			} else {
				// Silence detected
				if (this.isSpeaking) {
					if (this.silenceStartTime === 0) {
						this.silenceStartTime = currentTime;
					}

					const silenceDuration = currentTime - this.silenceStartTime;
					if (silenceDuration >= (this.config.minSilenceDurationMs / 1000)) {
						// Speech ended
						segments.push({
							start: this.speechStartTime,
							end: this.silenceStartTime,
							confidence: probability
						});

						this.isSpeaking = false;
						this.silenceStartTime = 0;
					}
				}
			}

			this.lastProcessedTime = currentTime;
		}

		return segments;
	}

	/**
	 * Detect voice in a single frame
	 * Returns probability (0-1)
	 */
	private async detectVoice(frame: Float32Array): Promise<number> {
		if (!this.session) {
			throw new Error('VAD model not initialized');
		}

		// Prepare input: concatenate context + frame
		const inputLength = this.CONTEXT_SIZE + this.frameSizeSamples;
		const inputArray = new Float32Array(inputLength);
		inputArray.set(this.context, 0);
		inputArray.set(frame, this.CONTEXT_SIZE);

		// Create input tensors
		const inputTensor = new ort.Tensor('float32', inputArray, [1, inputLength]);
		const stateTensor = new ort.Tensor('float32', this.hiddenState, [2, 1, 128]);
		const srTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(this.config.sampleRate)]), [1]);

		// Run inference
		const feeds = {
			'input': inputTensor,
			'state': stateTensor,
			'sr': srTensor
		};

		const results = await this.session.run(feeds);

		// Extract outputs
		const probability = (results.output as ort.Tensor).data[0] as number;
		const newState = results.stateN as ort.Tensor;

		// Update hidden state
		this.hiddenState = new Float32Array(newState.data as Float32Array);

		// Update context (last 64 samples of frame)
		if (frame.length >= this.CONTEXT_SIZE) {
			this.context = frame.slice(-this.CONTEXT_SIZE);
		} else {
			// Shift context and append frame
			const newContext = new Float32Array(this.CONTEXT_SIZE);
			newContext.set(this.context.slice(frame.length), 0);
			newContext.set(frame, this.CONTEXT_SIZE - frame.length);
			this.context = newContext;
		}

		return probability;
	}

	/**
	 * Finalize processing and return any pending segment
	 */
	finalize(): VadSegment | null {
		if (this.isSpeaking) {
			const segment: VadSegment = {
				start: this.speechStartTime,
				end: this.lastProcessedTime,
				confidence: 1.0 // Assuming high confidence for ongoing speech
			};

			// Reset state
			this.isSpeaking = false;
			this.speechStartTime = 0;
			this.silenceStartTime = 0;

			return segment;
		}

		return null;
	}

	/**
	 * Reset internal state
	 */
	reset(): void {
		this.hiddenState.fill(0);
		this.context.fill(0);
		this.isSpeaking = false;
		this.speechStartTime = 0;
		this.silenceStartTime = 0;
		this.lastProcessedTime = 0;
	}

	/**
	 * Cleanup resources
	 */
	async dispose(): Promise<void> {
		if (this.session) {
			// ONNX Runtime sessions don't have explicit disposal in Node.js
			this.session = null;
		}
	}
}
