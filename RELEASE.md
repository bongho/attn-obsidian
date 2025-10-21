# Release Guide

이 문서는 ATTN Obsidian 플러그인의 새 버전을 릴리스하는 방법을 설명합니다.

## 🚀 자동 릴리스 프로세스

GitHub Actions를 사용하여 자동으로 빌드하고 릴리스합니다.

### 1. 버전 업데이트

```bash
# 버전 업데이트 (예: 1.0.0 → 1.1.0)
npm version patch   # 1.0.0 → 1.0.1 (버그 수정)
npm version minor   # 1.0.0 → 1.1.0 (새 기능)
npm version major   # 1.0.0 → 2.0.0 (Breaking changes)
```

이 명령은 자동으로:
- `package.json`의 `version` 업데이트
- `manifest.json`의 `version` 업데이트
- `versions.json`에 새 버전 추가
- Git commit 생성

### 2. 태그 생성 및 푸시

```bash
# 태그 생성
git tag 1.1.0

# 태그 푸시 (릴리스 자동 시작)
git push origin 1.1.0
```

### 3. 자동 빌드 및 릴리스

태그를 푸시하면 GitHub Actions가 자동으로:
1. ✅ 의존성 설치
2. ✅ 플러그인 빌드 (`main.js` 생성)
3. ✅ 릴리스 파일 생성:
   - `manifest.json`
   - `main.js`
   - `styles.css` (있는 경우)
   - `attn-obsidian-[version].zip` (전체 패키지)
4. ✅ GitHub Release 자동 생성

### 4. 릴리스 노트 수정 (선택사항)

GitHub에서 자동 생성된 Release를 수정하여 상세한 변경 사항을 추가할 수 있습니다.

## 📦 수동 릴리스 (필요한 경우)

자동 릴리스가 실패한 경우:

```bash
# 1. 빌드
npm run build

# 2. 릴리스 파일 확인
ls -la main.js manifest.json styles.css

# 3. GitHub Release 페이지에서 수동 업로드
# https://github.com/bongho/attn-obsidian/releases/new
```

## 📋 릴리스 체크리스트

릴리스 전 확인사항:

- [ ] 모든 테스트 통과 (`npm test`)
- [ ] 타입 체크 통과 (`npm run typecheck`)
- [ ] Lint 통과 (`npm run lint`)
- [ ] 빌드 성공 (`npm run build`)
- [ ] CHANGELOG 업데이트
- [ ] README 버전 정보 확인
- [ ] manifest.json의 minAppVersion 확인

## 🔄 버전 관리 규칙

### Semantic Versioning

- **MAJOR**: Breaking changes (API 변경, 호환성 깨짐)
- **MINOR**: 새 기능 추가 (하위 호환)
- **PATCH**: 버그 수정

### 예시

```
1.0.0 → 1.0.1  # 버그 수정
1.0.1 → 1.1.0  # 새 기능 (템플릿 지원 추가)
1.1.0 → 2.0.0  # Breaking change (설정 구조 변경)
```

## 🛠️ 문제 해결

### GitHub Actions 빌드 실패

```bash
# 로컬에서 빌드 테스트
npm ci
npm run build

# 빌드 파일 확인
ls -la main.js
```

### 릴리스 취소

```bash
# 로컬 태그 삭제
git tag -d 1.1.0

# 원격 태그 삭제
git push origin :refs/tags/1.1.0

# GitHub에서 Release 수동 삭제
```

## 📚 참고

- [GitHub Actions Release](https://github.com/bongho/attn-obsidian/blob/main/.github/workflows/release.yml)
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions)
