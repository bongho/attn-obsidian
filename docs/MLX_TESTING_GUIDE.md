# MLX Whisper Testing Guide

Phase 3 구현의 테스트 가이드입니다.

## 사전 요구사항

### 1. 시스템 요구사항
- ✅ Apple Silicon Mac (M1/M2/M3)
- ✅ Python 3.9+
- ✅ Node.js 16+
- ✅ 약 2GB 디스크 공간 (모델 다운로드)

### 2. Python 환경 설정

```bash
# Python 버전 확인
python3 --version  # 3.9 이상 필요

# mlx-whisper 설치
pip3 install mlx-whisper

# 설치 확인
python3 -c "import mlx_whisper; print(mlx_whisper.__version__)"
```

## 테스트 단계

### 단계 1: Python 환경 체크

```bash
# Python 브릿지 스크립트 직접 테스트
python3 python/mlx_whisper_bridge.py
```

**예상 출력:**
```json
{"status": "ready", "version": "0.3.x"}
```

stdin으로 명령어를 보내 테스트:
```json
{"command": "ping"}
```

**예상 응답:**
```json
{"status": "success", "message": "pong"}
```

종료: `{"command": "quit"}`

### 단계 2: TypeScript 통합 테스트

```bash
# 프로젝트 빌드
npm run build

# MLX 통합 테스트 실행
npx ts-node tests/mlx-integration.test.ts "Recording 20250911105152.m4a"
```

**테스트 내용:**
1. ✅ Python 환경 체크
2. ✅ MlxBridge 초기화 및 통신
3. ✅ LocalMlxWhisperProvider 전사

**예상 출력:**
```
============================================================
MLX Whisper Integration Test
============================================================

📋 Step 1: Checking Python Environment
------------------------------------------------------------
Python Available: ✅
Python Version: 3.11.x
Python Path: /usr/local/bin/python3
Apple Silicon: ✅
Platform: darwin
mlx-whisper Available: ✅
mlx-whisper Version: 0.3.x

📋 Step 2: Testing MlxBridge Communication
------------------------------------------------------------
Initializing MLX bridge...
✅ Bridge initialized successfully
Testing ping...
✅ Ping successful: true
Loading model: mlx-community/whisper-medium-mlx...
✅ Model loaded successfully

📋 Step 3: Testing LocalMlxWhisperProvider
------------------------------------------------------------
Reading audio file: Recording 20250911105152.m4a
✅ Audio file loaded: 1234.56 KB

Transcribing audio...

✅ Transcription Complete!
------------------------------------------------------------
Duration: 5.32s
Audio Length: 15.24s
Language: ko
Segments: 8

Transcription Text:
------------------------------------------------------------
[전사된 텍스트 내용...]
------------------------------------------------------------

📊 Performance Metrics:
------------------------------------------------------------
Audio Duration: 15.24s
Processing Time: 5.32s
Speed: 2.86x realtime

============================================================
✅ All tests passed!
============================================================
```

### 단계 3: 10분 파일 테스트

긴 오디오 파일(10분)로 성능 테스트:

```bash
# 10분 오디오 파일 준비 (약 10MB)
# 실제 녹음 파일을 사용하거나 테스트 파일 생성

npx ts-node tests/mlx-integration.test.ts <10분-오디오-파일.m4a>
```

**예상 성능 (M2 MacBook Pro 기준):**
- **whisper-medium-mlx**: ~2분 (10분 오디오)
- **whisper-large-v3-mlx**: ~3분 (10분 오디오)
- **실시간 배속**: 3-5배

## 모델 비교

| 모델 | 크기 | 정확도 | 10분 오디오 처리 시간 | 권장 사용 |
|------|------|--------|----------------------|----------|
| whisper-tiny-mlx | ~100MB | 낮음 | ~30초 | 빠른 초안 |
| whisper-base-mlx | ~150MB | 보통 | ~45초 | 빠른 전사 |
| whisper-small-mlx | ~500MB | 좋음 | ~1분 | 균형잡힌 선택 |
| whisper-medium-mlx | ~1.5GB | 매우 좋음 | ~2분 | **권장** |
| whisper-large-v3-mlx | ~3GB | 최고 | ~3분 | 최고 품질 |

## 문제 해결

### mlx_whisper not found

```bash
pip3 install mlx-whisper

# 또는 requirements.txt 사용
cd python
pip3 install -r requirements.txt
```

### MLX bridge initialization timeout

- Python 경로가 올바른지 확인
- 모델 다운로드가 진행 중일 수 있음 (첫 실행 시 시간 소요)
- 네트워크 연결 확인

### Apple Silicon 아님

MLX는 M1/M2/M3 Mac에서만 작동합니다.
Intel Mac이나 다른 플랫폼에서는 `openai`, `gemini`, `groq` 프로바이더를 사용하세요.

### 모델 다운로드 느림

첫 실행 시 HuggingFace에서 모델을 다운로드합니다:
- whisper-medium-mlx: ~1.5GB
- whisper-large-v3-mlx: ~3GB

인터넷 속도에 따라 5-15분 소요될 수 있습니다.

### Permission denied

```bash
chmod +x python/mlx_whisper_bridge.py
```

## 성능 최적화 팁

### 1. CoreML 엔코더 사용
LocalMlxWhisperProvider는 자동으로 CoreML 엔코더를 활성화합니다 (18배 속도 향상).

### 2. 모델 선택
- **빠른 전사**: whisper-small-mlx
- **균형잡힌 품질**: whisper-medium-mlx (권장)
- **최고 품질**: whisper-large-v3-mlx

### 3. 배치 처리
여러 파일을 처리할 때는 MlxBridge를 재사용하여 모델 로드 시간을 절약하세요.

## API vs MLX 비교

### MLX 장점
- ✅ **3-5배 빠른 속도**
- ✅ **무제한 무료**
- ✅ **완전한 프라이버시** (로컬 처리)
- ✅ **오프라인 작동**
- ✅ **파일 크기 제한 없음**

### MLX 단점
- ❌ Apple Silicon 전용
- ❌ 첫 실행 시 모델 다운로드 필요
- ❌ 2-3GB 디스크 공간 필요

### API 장점
- ✅ 모든 플랫폼 지원
- ✅ 설치 불필요
- ✅ 항상 최신 모델

### API 단점
- ❌ 사용료 부과
- ❌ 인터넷 연결 필요
- ❌ 파일 크기 제한 (25MB)
- ❌ 프라이버시 이슈

## 다음 단계

테스트가 성공적으로 완료되면:

1. ✅ Obsidian 플러그인 설정에서 Provider를 `local-mlx`로 변경
2. ✅ 모델 선택: `mlx-community/whisper-medium-mlx`
3. ✅ 언어 설정: `ko` (한국어)
4. ✅ 실제 음성 녹음 파일로 전사 테스트

## 참고 자료

- [MLX GitHub](https://github.com/ml-explore/mlx)
- [MLX Whisper Examples](https://github.com/ml-explore/mlx-examples/tree/main/whisper)
- [Lightning-SimulWhisper](https://github.com/altalt-org/Lightning-SimulWhisper)
- [ATTN Phase 3 Plan](./PHASE3_PLAN.md)
