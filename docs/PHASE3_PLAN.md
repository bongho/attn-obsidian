# Phase 3 구현 계획: MLX 로컬 Whisper 통합

## 🎯 목표

Apple Silicon에서 3-5배 빠른 로컬 Whisper 전사 구현

**핵심 전략**: Python 브릿지를 통한 MLX Whisper 통합

---

## 📊 기술 선택 분석

### 옵션 비교

| 방식 | 장점 | 단점 | 개발 기간 |
|------|------|------|----------|
| **Python 브릿지** ✅ | • 빠른 구현<br>• Lightning 코드 재사용<br>• 안정성 높음 | • Python 의존성<br>• IPC 오버헤드 | **2-3주** |
| Native 모듈 | • 최고 성능<br>• 단일 의존성 | • C++/Swift 개발 필요<br>• 복잡한 빌드 | 2-3개월 |
| ONNX 변환 | • 기존 onnxruntime 활용 | • MLX 고유 기능 손실<br>• 변환 복잡 | 1-2개월 |

**선택**: Python 브릿지 (현실적이고 빠름)

---

## 🏗️ 아키텍처 설계

### 전체 흐름

```
ATTN (TypeScript)
    ↓
LocalMlxWhisperProvider
    ↓ (child_process)
Python 브릿지 스크립트
    ↓
mlx-whisper 라이브러리
    ↓
MLX + CoreML (Apple Silicon)
    ↓
결과 반환 (JSON)
    ↓
ATTN에서 처리
```

### 통신 프로토콜

**요청** (stdin → JSON):
```json
{
  "command": "transcribe",
  "audio_path": "/tmp/audio.m4a",
  "model": "mlx-community/whisper-large-v3-mlx",
  "language": "ko",
  "prompt": "이전 컨텍스트...",
  "use_coreml": true
}
```

**응답** (stdout → JSON):
```json
{
  "status": "success",
  "text": "전사 결과...",
  "segments": [...],
  "processing_time": 5.2
}
```

---

## 📁 파일 구조

```
attn-obsidian/
├── src/
│   ├── providers/
│   │   └── LocalMlxWhisperProvider.ts    # 신규: MLX 프로바이더
│   └── utils/
│       ├── mlxBridge.ts                  # 신규: Python 브릿지
│       └── pythonEnvChecker.ts           # 신규: 환경 체크
├── python/
│   ├── mlx_whisper_bridge.py             # 신규: 브릿지 스크립트
│   ├── requirements.txt                   # 신규: Python 의존성
│   └── README.md                          # 신규: Python 설정 가이드
└── docs/
    └── PHASE3_PLAN.md                     # 이 파일
```

---

## 🔧 구현 단계

### Week 1-2: 기본 구조 (현재 주)

#### Task 1.1: Python 환경 체크 도구
```typescript
// src/utils/pythonEnvChecker.ts
class PythonEnvChecker {
  async checkPython(): Promise<boolean>
  async checkMlxWhisper(): Promise<boolean>
  async installMlxWhisper(): Promise<void>
}
```

#### Task 1.2: Python 브릿지 스크립트
```python
# python/mlx_whisper_bridge.py
import mlx_whisper
import json
import sys

def transcribe(request):
    audio = mlx_whisper.load_audio(request['audio_path'])
    result = mlx_whisper.transcribe(
        audio,
        model=request['model'],
        language=request['language'],
        initial_prompt=request.get('prompt')
    )
    return result

def main():
    for line in sys.stdin:
        request = json.loads(line)
        result = transcribe(request)
        print(json.dumps(result))
        sys.stdout.flush()
```

#### Task 1.3: TypeScript 브릿지
```typescript
// src/utils/mlxBridge.ts
class MlxBridge {
  private process?: ChildProcess;

  async initialize(): Promise<void>
  async transcribe(request: MlxRequest): Promise<MlxResponse>
  async dispose(): Promise<void>
}
```

---

### Week 3: Provider 구현

#### Task 2.1: LocalMlxWhisperProvider
```typescript
// src/providers/LocalMlxWhisperProvider.ts
export class LocalMlxWhisperProvider implements SpeechToTextProvider {
  private bridge: MlxBridge;
  private fallbackProvider?: SpeechToTextProvider;

  async transcribe(
    input: ArrayBuffer | Buffer | string,
    options: { format, language, model, prompt? }
  ): Promise<VerboseTranscriptionResult> {
    try {
      // MLX 시도
      return await this.transcribeWithMlx(input, options);
    } catch (error) {
      // API fallback
      return await this.fallbackProvider.transcribe(input, options);
    }
  }
}
```

#### Task 2.2: 프로바이더 팩토리 통합
```typescript
// src/providers/providerFactory.ts에 추가
case 'local-mlx':
  return new LocalMlxWhisperProvider(settings);
```

---

### Week 4: 최적화 & 테스트

#### Task 3.1: 병렬 처리
- Worker Threads로 여러 Python 프로세스 관리
- 청크별 병렬 전사

#### Task 3.2: 메모리 관리
- 프로세스 풀 크기 제한 (CPU 코어 수 기반)
- 자동 재시작 (메모리 누수 방지)

#### Task 3.3: 에러 처리
- Python 크래시 감지
- 자동 fallback
- 재시도 로직

---

## 🎮 사용자 경험

### 설정 UI

```typescript
// settings.ts에 추가
{
  provider: 'local-mlx',
  model: 'mlx-community/whisper-large-v3-mlx',
  useCoreML: true,  // 18배 속도 향상
  fallbackToAPI: true
}
```

### 자동 설치 가이드

최초 사용 시:
```
❌ MLX Whisper not found

Would you like to install it?
[Install Automatically] [Manual Setup] [Use API Instead]

Installation requires:
• Python 3.9+
• ~2GB disk space (models)
• Apple Silicon Mac (M1/M2/M3)

Estimated time: 5-10 minutes
```

---

## 📊 성능 목표

### 처리 속도

| 파일 길이 | API (현재) | MLX (목표) | 개선 |
|-----------|------------|------------|------|
| 10분 | 2분 10초 | **30초** | **-77%** |
| 30분 | 6분 20초 | **1분 40초** | **-74%** |
| 1시간 | 12분 30초 | **3분** | **-76%** |

### 비용

| 사용량 | API 비용 | MLX 비용 | 절감 |
|--------|----------|----------|------|
| 10시간/월 | $6.00 | **$0** | **-100%** |
| 100시간/월 | $60.00 | **$0** | **-100%** |

---

## 🧪 테스트 계획

### Unit 테스트
- Python 환경 체크
- 브릿지 통신
- 에러 핸들링
- Fallback 로직

### 통합 테스트
- 10분 파일 전사
- 1시간 파일 안정성
- CoreML on/off 비교
- API fallback 동작

### 성능 테스트
- 벤치마크 자동 생성
- API vs MLX 비교
- 메모리 사용량 측정

---

## 🚧 예상 이슈 & 해결

### Issue 1: Python 의존성
**문제**: 사용자 Python 환경 다양함

**해결**:
1. 가상환경 자동 생성
2. 상세한 설치 가이드
3. API fallback 기본 제공

### Issue 2: 모델 다운로드
**문제**: 첫 실행 시 2GB 다운로드

**해결**:
1. 진행 상황 표시
2. 백그라운드 다운로드
3. 다운로드 전 확인 프롬프트

### Issue 3: 프로세스 통신 오버헤드
**문제**: IPC 레이턴시

**해결**:
1. 프로세스 풀 재사용
2. 배치 처리
3. 청크 크기 최적화 (더 큰 청크)

### Issue 4: Intel Mac 미지원
**문제**: MLX는 Apple Silicon 전용

**해결**:
1. 자동 플랫폼 감지
2. Intel Mac에서는 API 사용
3. 명확한 시스템 요구사항 표시

---

## ✅ 완료 기준

### Phase 3.1: 기본 구현 (2주)
- [ ] Python 환경 체크 구현
- [ ] Python 브릿지 스크립트 작성
- [ ] MlxBridge TypeScript 래퍼
- [ ] LocalMlxWhisperProvider 기본 구현
- [ ] 10분 파일 전사 성공

### Phase 3.2: 최적화 (1주)
- [ ] CoreML 인코더 통합
- [ ] Worker Threads 병렬 처리
- [ ] 메모리 관리 구현
- [ ] 1시간 파일 안정성 확인

### Phase 3.3: 사용자 경험 (1주)
- [ ] 자동 설치 UI
- [ ] 진행 상황 표시
- [ ] 에러 메시지 개선
- [ ] 문서 작성

---

## 🎓 학습 자료

### MLX Whisper
- https://github.com/ml-explore/mlx-examples/tree/main/whisper
- https://github.com/ml-explore/mlx

### 참고 구현
- Lightning-SimulWhisper (Python MLX 구현)
- faster-whisper (C++ 최적화 참고)

---

## 📅 타임라인

```
Week 1-2: 기본 구조 ████████░░░░░░░░ 50%
Week 3:   Provider 구현 ░░░░░░░░░░░░░░░░ 0%
Week 4:   최적화 & 테스트 ░░░░░░░░░░░░░░░░ 0%

Total: 4주 예상
```

**현재 상태**: Week 1 시작

---

## 🚀 시작하기

다음 단계:
1. Python 환경 체크 도구 구현
2. 브릿지 스크립트 작성
3. 기본 통신 테스트

**지금 바로 구현을 시작합니다!** 🏃‍♂️
