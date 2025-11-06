# 📖 ATTN 사용 설명서 (한국어)

> Audio To Tidied Notes - 완벽 가이드

## 📑 목차

1. [소개](#소개)
2. [시스템 요구사항](#시스템-요구사항)
3. [설치 가이드](#설치-가이드)
4. [STT 제공자 선택](#stt-제공자-선택)
5. [Local MLX Whisper 설정](#local-mlx-whisper-설정)
6. [사용 방법](#사용-방법)
7. [고급 설정](#고급-설정)
8. [문제 해결](#문제-해결)

---

## 소개

**ATTN (Audio To Tidied Notes)**는 오디오 파일을 자동으로 텍스트로 변환하고 구조화된 노트를 생성하는 Obsidian 플러그인입니다.

### 주요 특징

- 🎯 **5가지 STT 제공자**: OpenAI, Google Gemini, Groq, Local Whisper, Local MLX
- ⚡ **초고속 처리**: Local MLX로 16.45x realtime 속도
- 🍎 **Apple Silicon 최적화**: M1/M2/M3 맥 전용 가속
- 🔐 **프라이버시 보호**: 로컬 모델 옵션 제공
- 💰 **비용 효율적**: 무료 로컬 옵션 + 저렴한 클라우드 옵션

---

## 시스템 요구사항

### 기본 요구사항
- Obsidian v1.0.0 이상
- 인터넷 연결 (클라우드 STT 사용시)

### Local MLX Whisper 요구사항 (선택사항)
- **필수**: Apple Silicon Mac (M1/M2/M3)
- **필수**: Python 3.9 이상
- **필수**: macOS 12.0 (Monterey) 이상
- **권장**: 16GB 이상 RAM (medium 모델 기준)

### 클라우드 STT 요구사항
- OpenAI: API 키 + 결제 수단
- Google Gemini: API 키 (무료 티어 가능)
- Groq: API 키 (무료 티어 가능)

---

## 설치 가이드

### 1. 플러그인 설치

#### 수동 설치
1. [GitHub Releases](https://github.com/bongho/attn-obsidian/releases)에서 최신 버전 다운로드
2. 다운로드한 파일을 `.obsidian/plugins/audio-to-tidied-notes/`에 복사
3. Obsidian 재시작
4. 설정 → Community Plugins에서 활성화

### 2. Python 환경 설정 (Local MLX 사용시)

```bash
# Python 버전 확인
python3 --version  # 3.9 이상 필요

# 가상환경 생성 (권장)
cd /path/to/attn-obsidian/python
python3 -m venv venv
source venv/bin/activate

# MLX Whisper 설치
pip install mlx-whisper
```

---

## STT 제공자 선택

ATTN은 5가지 STT 제공자를 지원합니다. 상황에 맞게 선택하세요:

### 📊 제공자 비교표

| 제공자 | 속도 | 비용 | 파일크기 제한 | 품질 | 추천 용도 |
|--------|------|------|--------------|------|----------|
| **Local MLX** | ⭐⭐⭐⭐⭐ 16.45x | 무료 | 무제한 | ⭐⭐⭐⭐ | Apple Silicon 사용자 (최고 속도) |
| **Groq** | ⭐⭐⭐⭐⭐ 70x | 무료/저렴 | 25MB | ⭐⭐⭐⭐ | 빠른 처리 필요시 |
| **Google Gemini** | ⭐⭐⭐⭐ | 81% 저렴 | 2GB | ⭐⭐⭐⭐⭐ | 대용량 파일 (청킹 불필요) |
| **OpenAI Whisper** | ⭐⭐⭐ | 표준 | 25MB | ⭐⭐⭐⭐⭐ | 안정성 최우선 |
| **Local Whisper** | ⭐⭐ | 무료 | 무제한 | ⭐⭐⭐ | 크로스 플랫폼, 오프라인 |

### 💡 추천 시나리오

**Apple Silicon Mac 사용자 (M1/M2/M3)**
```
→ Local MLX Whisper (최고 성능 + 무료 + 무제한)
```

**긴 오디오 파일 (1시간 이상)**
```
→ Google Gemini (2GB 제한, 청킹 불필요)
```

**최고 속도 필요 + 클라우드 OK**
```
→ Groq (70x realtime)
```

**최고 품질 필요**
```
→ OpenAI Whisper 또는 Gemini
```

**완전 오프라인 필요 (Intel Mac 포함)**
```
→ Local Whisper (whisper.cpp 사용)
```

---

## Local MLX Whisper 설정

### 1단계: Python 환경 확인

```bash
# Apple Silicon 확인
uname -m  # arm64 출력 확인

# Python 설치 확인
python3 --version  # 3.9+ 필요
```

### 2단계: MLX Whisper 설치

```bash
# 프로젝트 디렉토리로 이동
cd /path/to/attn-obsidian/python

# 가상환경 생성 (선택사항이지만 강력 권장)
python3 -m venv venv
source venv/bin/activate

# MLX Whisper 설치
pip install mlx-whisper

# 설치 확인
python -c "import mlx_whisper; print('✅ MLX Whisper installed')"
```

### 3단계: ATTN 플러그인 설정

1. Obsidian → 설정 → Community Plugins → Audio To Tidied Notes
2. **STT Provider**: "Local MLX (Apple Silicon, no limits, free, fast)" 선택
3. **Python Path**: 가상환경 사용시 경로 지정
   ```
   예: /Users/username/Documents/attn-obsidian/python/venv/bin/python3
   ```
4. **Model**: 원하는 모델 크기 선택
   - `tiny`: 가장 빠름, 낮은 정확도
   - `base`: 빠름, 기본 정확도
   - `small`: 균형잡힌 선택
   - `medium`: 높은 정확도 (권장)
   - `large-v3`: 최고 정확도, 느림

### 4단계: 테스트

1. 짧은 오디오 파일(1-2분)로 테스트
2. 파일 우클릭 → "ATTN: 노트 생성하기"
3. 진행 상황 확인
4. 성공시 더 긴 파일로 시도

### 💡 성능 최적화 팁

#### 모델 크기 선택 가이드
```
tiny    (39 MB)  → 초고속, 영어 중심, 70-80% 정확도
base    (74 MB)  → 빠름, 다국어, 80-85% 정확도
small   (244 MB) → 균형, 다국어, 85-90% 정확도
medium  (769 MB) → 고품질, 다국어, 90-95% 정확도 ⭐ 권장
large-v3(1550MB) → 최고품질, 95%+ 정확도, 느림
```

#### RAM 요구사항
- tiny/base: 4GB+
- small: 8GB+
- medium: 16GB+ (권장)
- large-v3: 32GB+

#### 첫 실행이 느린 이유
- 모델 자동 다운로드 (한 번만)
- medium: ~769MB (1-5분 소요)
- 이후 실행은 매우 빠름

---

## 사용 방법

### 기본 워크플로우

1. **오디오 파일 추가**
   - M4A, MP3, WAV 등 지원
   - Obsidian 볼트에 드래그 앤 드롭

2. **변환 실행**
   - 파일 우클릭
   - "ATTN: 노트 생성하기" 선택

3. **진행 상황 모니터링**
   - 우측 하단 알림으로 진행률 표시
   - Local MLX: 실시간 프레임 처리 속도 표시

4. **결과 확인**
   - 자동 생성된 노트 열림
   - 저장 위치: 설정에서 지정한 폴더

### 배치 처리

여러 파일을 한 번에 처리:
```bash
# Python 스크립트 사용 (개발 중)
cd python
python batch_process.py --input audio_files/ --output notes/
```

---

## 고급 설정

### 템플릿 커스터마이징

#### 파일명 템플릿
```
{{date:YYYY-MM-DD}}-{{filename}}
→ 2025-11-06-meeting-recording
```

#### 저장 폴더 템플릿
```
Meetings/{{date:YYYY}}/{{date:MM}}
→ Meetings/2025/11
```

#### 내용 템플릿
```markdown
# 📅 {{date:YYYY년 MM월 DD일}} 회의록

**원본**: [[{{filename}}]]
**생성**: {{time:HH:mm}}

## 요약
{{summary}}

## 주요 내용
{{transcript}}

---
*🤖 ATTN v2.0으로 생성*
```

### 성능 튜닝

#### Local MLX 최적화
```python
# python/mlx_whisper_bridge.py에서 수정 가능

# 배치 크기 조정 (더 빠른 처리)
chunk_size = 30  # 초 단위 (기본값)

# 온도 설정 (품질 vs 속도)
temperature = 0.0  # 더 정확
temperature = 0.2  # 더 빠름

# 반복 페널티
repetition_penalty = 1.2  # 반복 감소
```

#### 메모리 관리
```python
# 큰 파일 처리시 메모리 절약
max_audio_length = 3600  # 1시간 제한
```

---

## 문제 해결

### Local MLX 관련 문제

#### ❌ "Python not found"
```bash
# Python 경로 확인
which python3

# 설정에 절대 경로 입력
/usr/local/bin/python3
# 또는
/opt/homebrew/bin/python3
```

#### ❌ "mlx_whisper not installed"
```bash
# 가상환경 활성화 확인
source venv/bin/activate

# 재설치
pip uninstall mlx-whisper
pip install mlx-whisper

# 버전 확인
pip show mlx-whisper
```

#### ❌ "Not Apple Silicon"
```bash
# 아키텍처 확인
uname -m

# arm64 → Apple Silicon ✅
# x86_64 → Intel (Local Whisper 사용)
```

#### ⚠️ 모델 다운로드 느림
- 정상입니다! 첫 실행시 한 번만 다운로드
- medium: ~769MB, 1-5분 소요
- 이후 실행은 즉시 시작

#### ⚠️ 메모리 부족
```bash
# 작은 모델 사용
Model: medium → small 또는 base

# 긴 오디오 분할 처리
ffmpeg -i long.m4a -f segment -segment_time 600 out%03d.m4a
```

### 클라우드 STT 문제

#### ❌ OpenAI API 오류
```
1. API 키 확인: https://platform.openai.com/api-keys
2. 크레딧 잔액 확인: https://platform.openai.com/usage
3. 결제 수단 등록 확인
```

#### ❌ Gemini API 오류
```
1. API 키 발급: https://makersuite.google.com/app/apikey
2. 무료 티어 제한 확인 (분당 60 요청)
```

#### ❌ Groq API 오류
```
1. API 키 발급: https://console.groq.com/keys
2. 무료 티어 제한 확인
```

### 일반적인 문제

#### 🔧 파일 크기 제한 초과
```
OpenAI/Groq: 25MB 제한
→ Gemini 사용 (2GB 지원)
→ 또는 Local MLX/Whisper (무제한)
```

#### 🔧 긴 처리 시간
```
클라우드 STT: 네트워크 속도 의존
→ Local MLX로 전환 (16.45x realtime)
→ Groq 사용 (70x realtime)
```

#### 🔧 품질 문제
```
1. 더 큰 모델 사용 (medium → large-v3)
2. OpenAI/Gemini 사용 (최고 품질)
3. 오디오 품질 확인 (노이즈, 음량)
```

---

## CoreML 하이브리드 (선택사항)

Apple Neural Engine을 활용한 추가 가속 (2-5x):

### 설정 방법

```bash
cd python/whisper.cpp/models

# CoreML 모델 생성
bash generate-coreml-model.sh medium

# 주의: coremltools 호환성 이슈로 현재 선택사항
```

### 예상 성능
```
MLX-only:    16.45x realtime
CoreML+MLX:  32-80x realtime (이론값)
```

---

## 성능 벤치마크

### 실제 테스트 결과 (50분 오디오, M2 Max)

| 제공자 | 처리 시간 | 실시간 배율 | 비용 |
|--------|----------|-----------|------|
| Local MLX (medium) | 3분 2초 | **16.45x** | 무료 |
| Groq | ~43초 | **70x** | ~$0.30 |
| Gemini | ~5분 | ~10x | ~$0.03 |
| OpenAI | ~8분 | ~6x | ~$0.30 |
| Local Whisper | ~25분 | ~2x | 무료 |

---

## 추가 리소스

### 문서
- [Phase 5A 통합 문서](docs/PHASE5A_FULL_INTEGRATION.md)
- [MLX 구현 가이드](MLX_IMPLEMENTATION_GUIDE.md)
- [MLX 아키텍처 분석](MLX_ARCHITECTURE_ANALYSIS.md)

### 커뮤니티
- GitHub Issues: 버그 리포트
- GitHub Discussions: 질문 & 토론
- Discord: 실시간 지원 (예정)

### 개발자 가이드
- [API 문서](docs/API.md)
- [기여 가이드](CONTRIBUTING.md)
- [개발 환경 설정](docs/DEVELOPMENT.md)

---

## 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일 참조

---

<div align="center">

**🎉 ATTN으로 오디오 → 노트 변환의 새로운 차원을 경험하세요!**

*Made with ❤️ by the ATTN Team*

</div>
