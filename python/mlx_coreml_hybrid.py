#!/usr/bin/env python3
"""
CoreML + MLX Hybrid Whisper Pipeline

Phase 5A Full Implementation:
Integrates CoreML encoder with MLX decoder for maximum performance

Strategy:
1. Load MLX Whisper model
2. Replace encoder with CoreML encoder wrapper
3. Use existing mlx_whisper.transcribe() with hybrid model
"""

import mlx.core as mx
import mlx.nn as nn
import numpy as np
from typing import Dict, Any, Optional
from pathlib import Path

try:
    import mlx_whisper
    # Note: mlx_whisper API changed - use load_models or load the model via transcribe
    from mlx_whisper.audio import log_mel_spectrogram, pad_or_trim, N_SAMPLES
except ImportError:
    raise ImportError("mlx_whisper not installed")

try:
    from coreml_encoder import CoreMLEncoder
    COREML_AVAILABLE = True
except ImportError:
    COREML_AVAILABLE = False


class CoreMLEncoderWrapper(nn.Module):
    """
    Wrapper to make CoreML encoder compatible with MLX Whisper's AudioEncoder interface

    This class bridges CoreML and MLX:
    - Input: MLX array (mel spectrogram)
    - CoreML inference on Apple Neural Engine
    - Output: MLX array (audio features)
    """

    def __init__(self, coreml_encoder: CoreMLEncoder, original_encoder: nn.Module):
        super().__init__()
        self.coreml_encoder = coreml_encoder
        # Keep reference to original for fallback
        self._original_encoder = original_encoder
        # Copy positional embedding from original
        self._positional_embedding = original_encoder._positional_embedding

    def __call__(self, x: mx.array) -> mx.array:
        """
        Forward pass through CoreML encoder

        Args:
            x: mel spectrogram, shape (batch, n_mels, n_frames)

        Returns:
            audio_features: shape (batch, n_frames//2, n_state)
        """
        try:
            # CoreML encoder expects numpy input
            # Convert MLX -> numpy
            x_np = np.array(x)

            # Run CoreML inference (on Apple Neural Engine!)
            features = self.coreml_encoder(x_np)

            # Convert numpy -> MLX
            return mx.array(features)

        except Exception as e:
            # Fallback to original MLX encoder on error
            print(f"CoreML encoder failed, falling back to MLX: {e}")
            return self._original_encoder(x)


def create_hybrid_model(model_name: str = "medium") -> Optional[nn.Module]:
    """
    Create hybrid Whisper model with CoreML encoder + MLX decoder

    Args:
        model_name: Model size (tiny, base, small, medium, large-v3)

    Returns:
        Hybrid model or None if CoreML unavailable

    Raises:
        FileNotFoundError: If CoreML model not found
    """
    if not COREML_AVAILABLE:
        print("CoreML not available, cannot create hybrid model")
        return None

    # Load CoreML encoder first
    print(f"Loading CoreML encoder: {model_name}")
    try:
        coreml_encoder = CoreMLEncoder.from_model_name(
            model_name,
            compute_units="CPU_AND_NE"  # Use Apple Neural Engine
        )
    except FileNotFoundError as e:
        print(f"CoreML encoder not found: {e}")
        print("Generate CoreML model using whisper.cpp or disable CoreML")
        return None

    # Load MLX Whisper model via transcribe module
    # This works with mlx_whisper's current API
    print(f"Loading MLX Whisper model: {model_name}")
    from mlx_whisper.transcribe import ModelHolder
    from mlx_whisper import load_models

    # Load model using load_models function
    model_path = f"mlx-community/whisper-{model_name}-mlx"
    model = load_models(model_path)[0]  # Returns tuple (model, tokenizer)

    if model is None:
        print("Failed to load MLX Whisper model")
        return None

    # Replace encoder with CoreML wrapper
    print("Creating hybrid model (CoreML encoder + MLX decoder)")
    original_encoder = model.encoder
    model.encoder = CoreMLEncoderWrapper(coreml_encoder, original_encoder)

    print("✅ Hybrid model created successfully")
    return model


def transcribe_with_coreml(
    audio_path: str,
    model: nn.Module,
    **kwargs
) -> Dict[str, Any]:
    """
    Transcribe audio using hybrid CoreML+MLX model

    This is a wrapper around mlx_whisper.transcribe() that:
    1. Uses provided hybrid model (with CoreML encoder)
    2. Leverages all existing mlx_whisper functionality
    3. Returns standard mlx_whisper result format

    Args:
        audio_path: Path to audio file
        model: Hybrid model (from create_hybrid_model())
        **kwargs: All mlx_whisper.transcribe() parameters

    Returns:
        Transcription result dict with text, segments, etc.
    """
    # Note: mlx_whisper.transcribe() uses ModelHolder singleton
    # We need to inject our hybrid model into it

    from mlx_whisper.transcribe import ModelHolder

    # Temporarily override ModelHolder's cached model
    original_model = ModelHolder.model
    original_path = ModelHolder.model_path

    try:
        # Inject our hybrid model
        ModelHolder.model = model
        ModelHolder.model_path = "hybrid-coreml"

        # Use standard mlx_whisper.transcribe()
        # This will use our hybrid model with CoreML encoder!
        result = mlx_whisper.transcribe(
            audio_path,
            **kwargs
        )

        return result

    finally:
        # Restore original model
        ModelHolder.model = original_model
        ModelHolder.model_path = original_path


# ========== Testing Utilities ==========

def test_coreml_encoder():
    """Test CoreML encoder loading and basic inference"""
    if not COREML_AVAILABLE:
        print("❌ CoreML not available")
        return False

    try:
        encoder = CoreMLEncoder.from_model_name("medium")
        print(f"✅ CoreML encoder loaded: {encoder.model_path}")

        # Test inference with dummy mel spectrogram
        dummy_mel = np.random.randn(1, 80, 3000).astype(np.float32)
        features = encoder(dummy_mel)
        print(f"✅ Inference successful: {features.shape}")

        return True
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False


def benchmark_encoders(audio_path: str, model_name: str = "medium"):
    """
    Benchmark MLX-only vs CoreML+MLX hybrid

    Measures encoder speedup from CoreML
    """
    import time

    # Load audio
    import mlx_whisper.audio as audio_utils
    audio = audio_utils.load_audio(audio_path)
    mel = audio_utils.log_mel_spectrogram(audio)
    mel = mx.array(mel)[None, :, :]  # Add batch dimension

    print(f"\n📊 Benchmarking {model_name} encoder")
    print("=" * 60)

    # 1. MLX-only encoder
    print("\n1️⃣  MLX Encoder (baseline)")
    from mlx_whisper import load_models
    mlx_model = load_models(f"mlx-community/whisper-{model_name}-mlx")[0]

    start = time.time()
    for _ in range(3):  # Warmup + 2 runs
        mlx_features = mlx_model.encoder(mel)
        mx.eval(mlx_features)  # Force computation
    mlx_time = (time.time() - start) / 2  # Average of last 2 runs

    print(f"   Time: {mlx_time:.3f}s")
    print(f"   Shape: {mlx_features.shape}")

    # 2. CoreML+MLX hybrid encoder
    if not COREML_AVAILABLE:
        print("\n2️⃣  CoreML+MLX Hybrid: Not available")
        return

    print("\n2️⃣  CoreML+MLX Hybrid")
    try:
        hybrid_model = create_hybrid_model(model_name)
        if hybrid_model is None:
            print("   ❌ Failed to create hybrid model")
            return

        start = time.time()
        for _ in range(3):  # Warmup + 2 runs
            coreml_features = hybrid_model.encoder(mel)
            mx.eval(coreml_features)
        coreml_time = (time.time() - start) / 2

        print(f"   Time: {coreml_time:.3f}s")
        print(f"   Shape: {coreml_features.shape}")

        # Calculate speedup
        speedup = mlx_time / coreml_time
        print(f"\n🚀 Speedup: {speedup:.2f}x")

        # Verify output similarity
        diff = float(mx.mean(mx.abs(mlx_features - coreml_features)))
        print(f"📏 Mean absolute difference: {diff:.6f}")

    except Exception as e:
        print(f"   ❌ Error: {e}")


if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("CoreML + MLX Hybrid Whisper Pipeline")
    print("=" * 60)

    # Test CoreML encoder
    print("\n1. Testing CoreML Encoder...")
    test_coreml_encoder()

    # Benchmark if audio file provided
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        print(f"\n2. Benchmarking with: {audio_file}")
        benchmark_encoders(audio_file, model_name="medium")
    else:
        print("\nUsage: python mlx_coreml_hybrid.py <audio_file>")
        print("Example: python mlx_coreml_hybrid.py recording.m4a")
