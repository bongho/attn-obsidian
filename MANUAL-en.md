# 📖 ATTN User Manual (English)

> Audio To Tidied Notes - Complete Guide

## 📑 Table of Contents

1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Installation Guide](#installation-guide)
4. [STT Provider Selection](#stt-provider-selection)
5. [Local MLX Whisper Setup](#local-mlx-whisper-setup)
6. [How to Use](#how-to-use)
7. [Advanced Settings](#advanced-settings)
8. [Troubleshooting](#troubleshooting)

---

## Introduction

**ATTN (Audio To Tidied Notes)** is an Obsidian plugin that automatically converts audio files to text and generates structured notes.

### Key Features

- 🎯 **5 STT Providers**: OpenAI, Google Gemini, Groq, Local Whisper, Local MLX
- ⚡ **Ultra-Fast Processing**: 16.45x realtime with Local MLX
- 🍎 **Apple Silicon Optimized**: Exclusive acceleration for M1/M2/M3 Macs
- 🔐 **Privacy Protected**: Local model options available
- 💰 **Cost Effective**: Free local options + affordable cloud options

---

## System Requirements

### Basic Requirements
- Obsidian v1.0.0 or higher
- Internet connection (for cloud STT)

### Local MLX Whisper Requirements (Optional)
- **Required**: Apple Silicon Mac (M1/M2/M3)
- **Required**: Python 3.9 or higher
- **Required**: macOS 12.0 (Monterey) or higher
- **Recommended**: 16GB+ RAM (for medium model)

### Cloud STT Requirements
- OpenAI: API key + payment method
- Google Gemini: API key (free tier available)
- Groq: API key (free tier available)

---

## Installation Guide

### 1. Plugin Installation

#### Manual Installation
1. Download latest version from [GitHub Releases](https://github.com/bongho/attn-obsidian/releases)
2. Copy downloaded files to `.obsidian/plugins/audio-to-tidied-notes/`
3. Restart Obsidian
4. Enable in Settings → Community Plugins

### 2. Python Environment Setup (for Local MLX)

```bash
# Check Python version
python3 --version  # 3.9+ required

# Create virtual environment (recommended)
cd /path/to/attn-obsidian/python
python3 -m venv venv
source venv/bin/activate

# Install MLX Whisper
pip install mlx-whisper
```

---

## STT Provider Selection

ATTN supports 5 STT providers. Choose based on your needs:

### 📊 Provider Comparison

| Provider | Speed | Cost | File Size Limit | Quality | Best For |
|----------|-------|------|----------------|---------|----------|
| **Local MLX** | ⭐⭐⭐⭐⭐ 16.45x | Free | Unlimited | ⭐⭐⭐⭐ | Apple Silicon users (fastest) |
| **Groq** | ⭐⭐⭐⭐⭐ 70x | Free/Cheap | 25MB | ⭐⭐⭐⭐ | Speed priority |
| **Google Gemini** | ⭐⭐⭐⭐ | 81% cheaper | 2GB | ⭐⭐⭐⭐⭐ | Large files (no chunking) |
| **OpenAI Whisper** | ⭐⭐⭐ | Standard | 25MB | ⭐⭐⭐⭐⭐ | Stability priority |
| **Local Whisper** | ⭐⭐ | Free | Unlimited | ⭐⭐⭐ | Cross-platform, offline |

### 💡 Recommended Scenarios

**Apple Silicon Mac Users (M1/M2/M3)**
```
→ Local MLX Whisper (best performance + free + unlimited)
```

**Long Audio Files (1+ hours)**
```
→ Google Gemini (2GB limit, no chunking needed)
```

**Maximum Speed + Cloud OK**
```
→ Groq (70x realtime)
```

**Maximum Quality Needed**
```
→ OpenAI Whisper or Gemini
```

**Completely Offline (including Intel Mac)**
```
→ Local Whisper (using whisper.cpp)
```

---

## Local MLX Whisper Setup

### Step 1: Verify Python Environment

```bash
# Check Apple Silicon
uname -m  # Should output arm64

# Check Python installation
python3 --version  # Need 3.9+
```

### Step 2: Install MLX Whisper

```bash
# Navigate to project directory
cd /path/to/attn-obsidian/python

# Create virtual environment (optional but highly recommended)
python3 -m venv venv
source venv/bin/activate

# Install MLX Whisper
pip install mlx-whisper

# Verify installation
python -c "import mlx_whisper; print('✅ MLX Whisper installed')"
```

### Step 3: Configure ATTN Plugin

1. Obsidian → Settings → Community Plugins → Audio To Tidied Notes
2. **STT Provider**: Select "Local MLX (Apple Silicon, no limits, free, fast)"
3. **Python Path**: Specify path if using virtual environment
   ```
   Example: /Users/username/Documents/attn-obsidian/python/venv/bin/python3
   ```
4. **Model**: Choose desired model size
   - `tiny`: Fastest, lower accuracy
   - `base`: Fast, basic accuracy
   - `small`: Balanced choice
   - `medium`: High accuracy (recommended)
   - `large-v3`: Maximum accuracy, slower

### Step 4: Test

1. Test with short audio file (1-2 minutes)
2. Right-click file → "ATTN: Generate Note"
3. Monitor progress
4. If successful, try longer files

### 💡 Performance Optimization Tips

#### Model Size Selection Guide
```
tiny    (39 MB)  → Ultra-fast, English-focused, 70-80% accuracy
base    (74 MB)  → Fast, multilingual, 80-85% accuracy
small   (244 MB) → Balanced, multilingual, 85-90% accuracy
medium  (769 MB) → High quality, multilingual, 90-95% accuracy ⭐ Recommended
large-v3(1550MB) → Maximum quality, 95%+ accuracy, slower
```

#### RAM Requirements
- tiny/base: 4GB+
- small: 8GB+
- medium: 16GB+ (recommended)
- large-v3: 32GB+

#### Why First Run is Slow
- Automatic model download (once only)
- medium: ~769MB (1-5 minutes)
- Subsequent runs are very fast

---

## How to Use

### Basic Workflow

1. **Add Audio File**
   - Supports M4A, MP3, WAV, etc.
   - Drag and drop into Obsidian vault

2. **Start Conversion**
   - Right-click file
   - Select "ATTN: Generate Note"

3. **Monitor Progress**
   - Progress shown in bottom-right notification
   - Local MLX: Real-time frame processing speed display

4. **Check Results**
   - Auto-generated note opens
   - Save location: Folder specified in settings

### Batch Processing

Process multiple files at once:
```bash
# Using Python script (in development)
cd python
python batch_process.py --input audio_files/ --output notes/
```

---

## Advanced Settings

### Template Customization

#### Filename Template
```
{{date:YYYY-MM-DD}}-{{filename}}
→ 2025-11-06-meeting-recording
```

#### Save Folder Template
```
Meetings/{{date:YYYY}}/{{date:MM}}
→ Meetings/2025/11
```

#### Content Template
```markdown
# 📅 {{date:YYYY-MM-DD}} Meeting Notes

**Source**: [[{{filename}}]]
**Created**: {{time:HH:mm}}

## Summary
{{summary}}

## Key Content
{{transcript}}

---
*🤖 Generated by ATTN v2.0*
```

### Performance Tuning

#### Local MLX Optimization
```python
# Modifiable in python/mlx_whisper_bridge.py

# Adjust batch size (faster processing)
chunk_size = 30  # in seconds (default)

# Temperature setting (quality vs speed)
temperature = 0.0  # More accurate
temperature = 0.2  # Faster

# Repetition penalty
repetition_penalty = 1.2  # Reduce repetition
```

#### Memory Management
```python
# Memory saving for large files
max_audio_length = 3600  # 1 hour limit
```

---

## Troubleshooting

### Local MLX Related Issues

#### ❌ "Python not found"
```bash
# Check Python path
which python3

# Enter absolute path in settings
/usr/local/bin/python3
# or
/opt/homebrew/bin/python3
```

#### ❌ "mlx_whisper not installed"
```bash
# Verify virtual environment is activated
source venv/bin/activate

# Reinstall
pip uninstall mlx-whisper
pip install mlx-whisper

# Check version
pip show mlx-whisper
```

#### ❌ "Not Apple Silicon"
```bash
# Check architecture
uname -m

# arm64 → Apple Silicon ✅
# x86_64 → Intel (use Local Whisper)
```

#### ⚠️ Model Download Slow
- This is normal! One-time download on first run
- medium: ~769MB, 1-5 minutes
- Subsequent runs start immediately

#### ⚠️ Out of Memory
```bash
# Use smaller model
Model: medium → small or base

# Split long audio
ffmpeg -i long.m4a -f segment -segment_time 600 out%03d.m4a
```

### Cloud STT Issues

#### ❌ OpenAI API Error
```
1. Verify API key: https://platform.openai.com/api-keys
2. Check credit balance: https://platform.openai.com/usage
3. Verify payment method registered
```

#### ❌ Gemini API Error
```
1. Get API key: https://makersuite.google.com/app/apikey
2. Check free tier limits (60 requests/minute)
```

#### ❌ Groq API Error
```
1. Get API key: https://console.groq.com/keys
2. Check free tier limits
```

### General Issues

#### 🔧 File Size Limit Exceeded
```
OpenAI/Groq: 25MB limit
→ Use Gemini (2GB support)
→ Or Local MLX/Whisper (unlimited)
```

#### 🔧 Long Processing Time
```
Cloud STT: Depends on network speed
→ Switch to Local MLX (16.45x realtime)
→ Use Groq (70x realtime)
```

#### 🔧 Quality Issues
```
1. Use larger model (medium → large-v3)
2. Use OpenAI/Gemini (highest quality)
3. Check audio quality (noise, volume)
```

---

## CoreML Hybrid (Optional)

Additional acceleration using Apple Neural Engine (2-5x):

### Setup Instructions

```bash
cd python/whisper.cpp/models

# Generate CoreML model
bash generate-coreml-model.sh medium

# Note: Currently optional due to coremltools compatibility issues
```

### Expected Performance
```
MLX-only:    16.45x realtime
CoreML+MLX:  32-80x realtime (theoretical)
```

---

## Performance Benchmarks

### Real Test Results (50-minute audio, M2 Max)

| Provider | Processing Time | Realtime Multiplier | Cost |
|----------|----------------|-------------------|------|
| Local MLX (medium) | 3m 2s | **16.45x** | Free |
| Groq | ~43s | **70x** | ~$0.30 |
| Gemini | ~5m | ~10x | ~$0.03 |
| OpenAI | ~8m | ~6x | ~$0.30 |
| Local Whisper | ~25m | ~2x | Free |

---

## Additional Resources

### Documentation
- [Phase 5A Integration Docs](docs/PHASE5A_FULL_INTEGRATION.md)
- [MLX Implementation Guide](MLX_IMPLEMENTATION_GUIDE.md)
- [MLX Architecture Analysis](MLX_ARCHITECTURE_ANALYSIS.md)

### Community
- GitHub Issues: Bug reports
- GitHub Discussions: Questions & discussions
- Discord: Real-time support (coming soon)

### Developer Guide
- [API Documentation](docs/API.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Development Setup](docs/DEVELOPMENT.md)

---

## License

MIT License - See [LICENSE](LICENSE) file for details

---

<div align="center">

**🎉 Experience a new dimension of audio → note conversion with ATTN!**

*Made with ❤️ by the ATTN Team*

</div>
