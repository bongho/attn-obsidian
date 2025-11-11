/**
 * Silero VAD (Voice Activity Detection) Wrapper
 * Web-based implementation using @ricky0123/vad-web
 *
 * Features:
 * - Browser-compatible VAD using ONNX Runtime Web
 * - Works in Electron/Obsidian environment
 * - Compatible with original vadDetector interface
 */

// Dynamic import to make VAD optional
type NonRealTimeVAD = any;

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
	private vad: NonRealTimeVAD | null = null;
	private config: VadConfig;
	private isInitialized = false;

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
	}

	/**
	 * Initialize VAD model
	 * @param basePath - Base path for model files (optional, uses CDN by default)
	 */
	async initialize(basePath?: string): Promise<void> {
		try {
			// Try to dynamically import VAD module (optional dependency)
			// @ts-ignore - Optional dependency, may not be installed
			const vadModule = await import('@ricky0123/vad-web').catch(() => null);

			if (!vadModule) {
				console.warn('VAD module (@ricky0123/vad-web) not available. VAD features disabled.');
				this.isInitialized = false;
				return;
			}

			// VAD configuration parameters
			// Converting from frame-based to ms-based as per latest API
			this.vad = await vadModule.NonRealTimeVAD.new({
				positiveSpeechThreshold: this.config.threshold,
				negativeSpeechThreshold: this.config.threshold - 0.15,
				redemptionMs: this.config.minSilenceDurationMs,
				preSpeechPadMs: this.config.speechPadMs,
				minSpeechMs: this.config.minSilenceDurationMs,
				submitUserSpeechOnPause: false,
			});
			this.isInitialized = true;
			console.log('Web-based VAD model loaded successfully');
		} catch (error) {
			console.warn('Failed to load VAD model. VAD features will be disabled:', error);
			this.isInitialized = false;
			this.vad = null;
		}
	}

	/**
	 * Process audio buffer and detect speech segments
	 */
	async processAudio(audioBuffer: Float32Array): Promise<VadSegment[]> {
		if (!this.vad || !this.isInitialized) {
			console.warn('VAD model not initialized. Returning empty segments.');
			return [];
		}

		const segments: VadSegment[] = [];

		try {
			// Use NonRealTimeVAD.run() which returns an async iterator
			for await (const { start, end } of this.vad.run(
				audioBuffer,
				this.config.sampleRate
			)) {
				// Convert milliseconds to seconds
				const startSeconds = start / 1000;
				const endSeconds = end / 1000;

				// Apply speech padding
				const paddedStart = Math.max(0, startSeconds - (this.config.speechPadMs / 1000));
				const paddedEnd = endSeconds;

				// Filter segments based on minimum silence duration
				// (The library handles this internally, but we can add extra filtering if needed)
				const duration = endSeconds - startSeconds;
				if (duration * 1000 >= this.config.minSilenceDurationMs) {
					segments.push({
						start: paddedStart,
						end: paddedEnd,
						confidence: 1.0 // @ricky0123/vad-web doesn't provide confidence scores
					});
				}
			}
		} catch (error) {
			console.error('VAD processing error:', error);
			throw new Error(`VAD processing failed: ${error}`);
		}

		return segments;
	}

	/**
	 * Finalize processing and return any pending segment
	 * Note: @ricky0123/vad-web handles this automatically,
	 * so this method is kept for interface compatibility
	 */
	finalize(): VadSegment | null {
		// The web-based VAD automatically finalizes segments
		// This method is kept for API compatibility
		return null;
	}

	/**
	 * Reset internal state
	 */
	reset(): void {
		// The web-based VAD doesn't maintain external state
		// Each processAudio() call is independent
		// This method is kept for API compatibility
	}

	/**
	 * Cleanup resources
	 */
	async dispose(): Promise<void> {
		if (this.vad) {
			// Check if the VAD instance has a dispose or cleanup method
			// @ricky0123/vad-web may or may not have explicit cleanup
			this.vad = null;
			this.isInitialized = false;
		}
	}
}
