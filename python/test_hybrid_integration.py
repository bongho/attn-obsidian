#!/usr/bin/env python3
"""
Test CoreML Hybrid Integration

Tests the integrated CoreML+MLX functionality in mlx_whisper_bridge.py
"""

import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

def test_imports():
    """Test that all imports work correctly"""
    print("=" * 60)
    print("Test 1: Import Check")
    print("=" * 60)

    try:
        import mlx_whisper
        print(f"✅ mlx_whisper: {mlx_whisper.__version__}")
    except ImportError as e:
        print(f"❌ mlx_whisper: {e}")
        return False

    try:
        from mlx_whisper_bridge import MlxWhisperBridge, COREML_AVAILABLE, HYBRID_AVAILABLE
        print(f"✅ mlx_whisper_bridge imported")
        print(f"   CoreML available: {COREML_AVAILABLE}")
        print(f"   Hybrid available: {HYBRID_AVAILABLE}")
    except ImportError as e:
        print(f"❌ mlx_whisper_bridge: {e}")
        return False

    if HYBRID_AVAILABLE:
        try:
            from mlx_coreml_hybrid import create_hybrid_model, transcribe_with_coreml
            print(f"✅ mlx_coreml_hybrid imported")
        except ImportError as e:
            print(f"❌ mlx_coreml_hybrid: {e}")
            return False

    return True


def test_bridge_initialization():
    """Test bridge initialization"""
    print("\n" + "=" * 60)
    print("Test 2: Bridge Initialization")
    print("=" * 60)

    try:
        from mlx_whisper_bridge import MlxWhisperBridge
        bridge = MlxWhisperBridge()

        print(f"✅ Bridge initialized")
        print(f"   use_coreml: {bridge.use_coreml}")
        print(f"   is_hybrid: {bridge.is_hybrid}")
        print(f"   current_model_name: {bridge.current_model_name}")

        return True
    except Exception as e:
        print(f"❌ Bridge initialization failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_model_loading():
    """Test model loading (will fallback to MLX-only if no CoreML)"""
    print("\n" + "=" * 60)
    print("Test 3: Model Loading")
    print("=" * 60)

    try:
        from mlx_whisper_bridge import MlxWhisperBridge
        bridge = MlxWhisperBridge()

        # Try to load medium model
        result = bridge.load_model("mlx-community/whisper-medium-mlx")

        print(f"Status: {result.get('status')}")
        print(f"Message: {result.get('message')}")
        print(f"Encoder: {result.get('encoder', 'not specified')}")
        print(f"CoreML Encoder: {result.get('coreml_encoder', 'not attempted')}")

        if result.get('coreml_error'):
            print(f"CoreML Error: {result.get('coreml_error')}")

        if result['status'] == 'success':
            print("✅ Model loading successful")
            return True
        else:
            print(f"❌ Model loading failed: {result.get('error')}")
            return False

    except Exception as e:
        print(f"❌ Model loading test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_hybrid_model_creation():
    """Test hybrid model creation directly (will fail if no CoreML models)"""
    print("\n" + "=" * 60)
    print("Test 4: Hybrid Model Creation (Direct)")
    print("=" * 60)

    try:
        from mlx_coreml_hybrid import create_hybrid_model, COREML_AVAILABLE

        if not COREML_AVAILABLE:
            print("⚠️  CoreML not available, skipping hybrid model test")
            return True

        print("Attempting to create hybrid model for 'medium'...")
        hybrid_model = create_hybrid_model("medium")

        if hybrid_model is not None:
            print("✅ Hybrid model created successfully")
            print(f"   Model type: {type(hybrid_model)}")
            return True
        else:
            print("⚠️  Hybrid model creation returned None (likely no CoreML models found)")
            print("   This is expected if CoreML models haven't been generated yet")
            return True  # Not a failure, just expected behavior

    except FileNotFoundError as e:
        print(f"⚠️  CoreML model file not found: {e}")
        print("   This is expected if CoreML models haven't been generated yet")
        return True  # Not a failure
    except Exception as e:
        print(f"❌ Hybrid model creation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_response_format():
    """Test that response includes all expected fields"""
    print("\n" + "=" * 60)
    print("Test 5: Response Format")
    print("=" * 60)

    try:
        from mlx_whisper_bridge import MlxWhisperBridge
        bridge = MlxWhisperBridge()

        # Load model and check response format
        result = bridge.load_model("mlx-community/whisper-medium-mlx")

        required_fields = ['status', 'model', 'is_quantized', 'coreml_available']
        optional_fields = ['encoder', 'coreml_encoder', 'coreml_speedup', 'message']

        print("Required fields:")
        for field in required_fields:
            if field in result:
                print(f"  ✅ {field}: {result[field]}")
            else:
                print(f"  ❌ {field}: MISSING")
                return False

        print("\nOptional fields:")
        for field in optional_fields:
            if field in result:
                print(f"  ✅ {field}: {result[field]}")

        return True

    except Exception as e:
        print(f"❌ Response format test failed: {e}")
        return False


def main():
    """Run all tests"""
    print("\n" + "=" * 60)
    print("CoreML Hybrid Integration Tests")
    print("=" * 60)

    tests = [
        ("Import Check", test_imports),
        ("Bridge Initialization", test_bridge_initialization),
        ("Model Loading", test_model_loading),
        ("Hybrid Model Creation", test_hybrid_model_creation),
        ("Response Format", test_response_format)
    ]

    results = []
    for name, test_func in tests:
        try:
            success = test_func()
            results.append((name, success))
        except Exception as e:
            print(f"\n❌ Test '{name}' crashed: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = sum(1 for _, success in results if success)
    total = len(results)

    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All tests passed!")
        print("\nNext steps:")
        print("1. Generate CoreML models using whisper.cpp (see Phase 5A docs)")
        print("2. Run benchmark with actual audio to measure speedup")
        return 0
    else:
        print("\n⚠️  Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
