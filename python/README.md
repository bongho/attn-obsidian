# MLX Whisper Python Bridge

Python 브릿지 스크립트로 ATTN에서 MLX Whisper를 사용합니다.

## 시스템 요구사항

- **Apple Silicon Mac** (M1/M2/M3)
- **Python 3.9+**
- **약 2GB 디스크 공간** (모델 다운로드)

## 설치

### 자동 설치 (권장)

ATTN 설정에서 "Install MLX Whisper" 버튼 클릭

### 수동 설치

```bash
# 1. Python 확인
python3 --version  # 3.9 이상 필요

# 2. mlx-whisper 설치
pip3 install mlx-whisper

# 또는 requirements.txt 사용
pip3 install -r requirements.txt

# 3. 설치 확인
python3 -c "import mlx_whisper; print(mlx_whisper.__version__)"
```

## 사용법

### 직접 실행 (테스트용)

```bash
# 브릿지 시작
python3 mlx_whisper_bridge.py

# JSON 요청 전송 (stdin)
{"command": "transcribe", "audio_path": "/path/to/audio.m4a", "language": "ko"}

# 결과 수신 (stdout)
{"status": "success", "text": "전사 결과...", ...}
```

### ATTN에서 사용

ATTN 설정:
- Provider: `local-mlx`
- Model: `mlx-community/whisper-large-v3-mlx`

## 지원 모델

| 모델 | 크기 | 정확도 | 속도 |
|------|------|--------|------|
| `whisper-tiny-mlx` | ~100MB | 낮음 | 빠름 |
| `whisper-base-mlx` | ~150MB | 보통 | 빠름 |
| `whisper-small-mlx` | ~500MB | 좋음 | 중간 |
| `whisper-medium-mlx` | ~1.5GB | 매우 좋음 | 중간 |
| `whisper-large-v3-mlx` | ~3GB | 최고 | 느림 |

**권장**: `whisper-medium-mlx` (품질과 속도 균형)

## 프로토콜

### 요청 형식

```json
{
  "command": "transcribe",
  "audio_path": "/path/to/audio.m4a",
  "model": "mlx-community/whisper-large-v3-mlx",
  "language": "ko",
  "prompt": "이전 컨텍스트...",
  "use_coreml": true
}
```

### 응답 형식

```json
{
  "status": "success",
  "text": "전사된 텍스트...",
  "language": "ko",
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 5.2,
      "text": "첫 번째 문장"
    }
  ],
  "processing_time": 5.3,
  "model": "mlx-community/whisper-large-v3-mlx"
}
```

### 에러 응답

```json
{
  "status": "error",
  "error": "Error message",
  "traceback": "Python traceback..."
}
```

## 명령어

| 명령 | 설명 |
|------|------|
| `transcribe` | 오디오 전사 |
| `load_model` | 모델 미리 로드 |
| `ping` | 연결 확인 |
| `quit` | 브릿지 종료 |

## 문제 해결

### mlx_whisper not found

```bash
pip3 install mlx-whisper
```

### Apple Silicon 아님

MLX는 M1/M2/M3 Mac에서만 작동합니다. Intel Mac이나 다른 플랫폼에서는 API 프로바이더를 사용하세요.

### 모델 다운로드 느림

첫 실행 시 모델을 자동으로 다운로드합니다 (~2GB). 시간이 걸릴 수 있습니다.

### Permission denied

```bash
chmod +x mlx_whisper_bridge.py
```

## 성능

### 예상 처리 시간 (M2 MacBook Pro 기준)

| 오디오 길이 | whisper-medium-mlx | whisper-large-v3-mlx |
|-------------|-------------------|---------------------|
| 10분 | ~30초 | ~45초 |
| 30분 | ~1분 30초 | ~2분 15초 |
| 1시간 | ~3분 | ~4분 30초 |

### API 대비

- **속도**: 3-5배 빠름
- **비용**: 무료 (로컬 처리)
- **프라이버시**: 데이터 외부 전송 없음

## 라이선스

MIT License

## 참고

- MLX: https://github.com/ml-explore/mlx
- MLX Whisper: https://github.com/ml-explore/mlx-examples/tree/main/whisper
- Lightning-SimulWhisper: https://github.com/altalt-org/Lightning-SimulWhisper
