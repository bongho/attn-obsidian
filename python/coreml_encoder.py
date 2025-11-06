"""
CoreML Encoder Wrapper for Whisper
Adapted from Lightning-SimulWhisper for ATTN

Provides CoreML-accelerated Whisper encoder using Apple Neural Engine
for 3-18x faster encoding on Apple Silicon (M1/M2/M3).
"""

import os
from pathlib import Path
from typing import Union
import numpy as np

try:
    import coremltools as ct
    COREML_AVAILABLE = True
except ImportError:
    COREML_AVAILABLE = False
    print("Warning: coremltools not available. CoreML encoder will not work.")

try:
    import mlx.core as mx
    MLX_AVAILABLE = True
except ImportError:
    MLX_AVAILABLE = False


class CoreMLEncoder:
    """
    CoreML Whisper encoder for Apple Neural Engine acceleration.

    Drop-in replacement for MLX AudioEncoder with 3-18x speedup.

    Args:
        model_path: Path to .mlpackage or .mlmodelc CoreML model
        compute_units: 'ALL', 'CPU_AND_NE' (recommended), or 'CPU_ONLY'
    """

    def __init__(
        self,
        model_path: Union[str, Path],
        compute_units: str = "CPU_AND_NE"
    ):
        if not COREML_AVAILABLE:
            raise RuntimeError(
                "coremltools not installed. "
                "Install with: pip install coremltools"
            )

        self.model_path = Path(model_path)

        # Handle both .mlmodelc and .mlpackage formats
        if not self.model_path.exists():
            # Try .mlpackage if .mlmodelc specified
            if str(self.model_path).endswith('.mlmodelc'):
                mlpackage_path = Path(str(self.model_path).replace('.mlmodelc', '.mlpackage'))
                if mlpackage_path.exists():
                    print(f"Using .mlpackage instead of .mlmodelc")
                    self.model_path = mlpackage_path
                else:
                    raise FileNotFoundError(
                        f"CoreML model not found: {model_path}\n"
                        f"Generate it using whisper.cpp:\n"
                        f"  cd python/whisper.cpp/models\n"
                        f"  ./generate-coreml-model.sh medium"
                    )
            else:
                raise FileNotFoundError(f"CoreML model not found: {model_path}")

        # Map compute units
        compute_units_map = {
            "ALL": ct.ComputeUnit.ALL,
            "CPU_AND_NE": ct.ComputeUnit.CPU_AND_NE,  # Recommended
            "CPU_ONLY": ct.ComputeUnit.CPU_ONLY
        }

        compute_unit = compute_units_map.get(compute_units.upper(), ct.ComputeUnit.CPU_AND_NE)

        # Load CoreML model
        print(f"Loading CoreML encoder: {self.model_path.name}")
        try:
            self.model = ct.models.MLModel(
                str(self.model_path),
                compute_units=compute_unit
            )
            print(f"✅ CoreML encoder loaded (compute: {compute_units})")
        except Exception as e:
            raise RuntimeError(
                f"Failed to load CoreML model: {e}\n"
                f"Try regenerating the model"
            )

        # Get input/output names
        spec = self.model.get_spec()
        self.input_name = spec.description.input[0].name
        self.output_name = spec.description.output[0].name

    def __call__(self, mel: Union[mx.array, np.ndarray]) -> mx.array:
        """
        Encode mel spectrogram using CoreML Neural Engine.

        Args:
            mel: Mel spectrogram (batch, n_mels, n_ctx) or (n_mels, n_ctx)
                Can be MLX array or numpy array

        Returns:
            Encoded features as MLX array (batch, n_ctx//2, n_state)
        """
        # Convert to numpy
        if MLX_AVAILABLE and isinstance(mel, mx.array):
            mel_np = np.array(mel)
        else:
            mel_np = np.asarray(mel)

        # Ensure float32
        mel_np = mel_np.astype(np.float32)

        # Add batch dimension if needed
        if mel_np.ndim == 2:
            mel_np = mel_np[np.newaxis, ...]

        # Run CoreML inference (on Neural Engine!)
        input_dict = {self.input_name: mel_np}
        output = self.model.predict(input_dict)

        # Extract output
        output_array = output[self.output_name]

        # Convert back to MLX
        if MLX_AVAILABLE:
            return mx.array(output_array)
        else:
            return output_array

    @staticmethod
    def find_model_path(model_name: str, search_dirs: list = None) -> Path:
        """
        Find CoreML model by name in common locations.

        Args:
            model_name: Model name (e.g., 'medium', 'large-v3')
            search_dirs: Additional directories to search

        Returns:
            Path to CoreML model

        Raises:
            FileNotFoundError if not found
        """
        if search_dirs is None:
            search_dirs = []

        # Default search locations
        default_dirs = [
            Path.cwd() / "models",
            Path.cwd() / "whisper.cpp" / "models",
            Path(__file__).parent / "models",
            Path(__file__).parent / "whisper.cpp" / "models",
        ]

        all_dirs = default_dirs + [Path(d) for d in search_dirs]

        # Model naming patterns
        model_patterns = [
            f"coreml-encoder-{model_name}.mlpackage",  # whisper.cpp format
            f"ggml-{model_name}-encoder.mlpackage",
            f"ggml-{model_name}-encoder.mlmodelc",
        ]

        for directory in all_dirs:
            for pattern in model_patterns:
                model_path = directory / pattern
                if model_path.exists():
                    return model_path

        raise FileNotFoundError(
            f"CoreML model '{model_name}' not found.\n"
            f"Searched for: {model_patterns}\n"
            f"In: {[str(d) for d in all_dirs]}\n\n"
            f"Generate it using:\n"
            f"  cd python/whisper.cpp/models\n"
            f"  ./generate-coreml-model.sh {model_name}"
        )

    @classmethod
    def from_model_name(
        cls,
        model_name: str,
        search_dirs: list = None,
        compute_units: str = "CPU_AND_NE"
    ) -> "CoreMLEncoder":
        """
        Create encoder from model name (auto-detects path).

        Args:
            model_name: Model name (e.g., 'medium')
            search_dirs: Additional search directories
            compute_units: Compute unit selection

        Returns:
            CoreMLEncoder instance
        """
        model_path = cls.find_model_path(model_name, search_dirs)
        return cls(model_path, compute_units)


def check_coreml_availability() -> dict:
    """Check CoreML availability and system info."""
    info = {
        "coreml_available": COREML_AVAILABLE,
        "mlx_available": MLX_AVAILABLE,
    }

    if COREML_AVAILABLE:
        try:
            import platform
            info["platform"] = platform.system()
            info["machine"] = platform.machine()
            info["coreml_version"] = ct.__version__
            info["is_apple_silicon"] = (
                platform.system() == "Darwin" and
                platform.machine() == "arm64"
            )
        except Exception as e:
            info["error"] = str(e)

    return info


if __name__ == "__main__":
    # Test CoreML availability
    info = check_coreml_availability()
    print("CoreML Availability Check:")
    for key, value in info.items():
        print(f"  {key}: {value}")

    # Try loading encoder
    try:
        encoder = CoreMLEncoder.from_model_name("medium")
        print(f"\n✅ Successfully loaded: {encoder.model_path}")
    except FileNotFoundError as e:
        print(f"\n❌ {e}")
