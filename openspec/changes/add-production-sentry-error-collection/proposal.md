## Why

Kosmo의 API, Web BFF, Web 앱은 프로덕션 처리되지 않은 예외를 중앙에서 조사할 수 없어 릴리스별 회귀와 원인을 stack trace 기준으로 추적할 수 없다. 7월 29일 서버·Web 배포 범위에 Sentry 오류 수집을 연결하고 Web 원본 소스 symbolication을 제공하되, 서버 source map과 Android·iOS 범위는 후속 Backlog로 남긴다.

## What Changes

- API와 Web BFF의 처리되지 않은 서버 예외를 전역 경계에서 한 번만 Sentry에 수집한다.
- Web 앱의 처리되지 않은 React·브라우저 오류를 공용 경계와 브라우저 런타임에서 수집한다.
- 세 runtime에 공통 환경·runtime·release 식별자를 붙이고 Web source map을 배포 전에 업로드한다.
- Sentry SDK가 만든 event와 exception은 `beforeSend`로 정제하지 않고 그대로 전송하며 자동 breadcrumb만 비활성화한다.
- 로컬 개발과 테스트에는 배포 DSN·환경·release를 기본 주입하지 않아 외부 전송하지 않는다.
- DSN과 source map 업로드 자격 증명을 Vault·GitHub 배포 설정으로 분리하고 운영 검증·triage 절차를 문서화한다.
- Android·iOS native runtime과 debug symbol 업로드는 Backlog인 PROD-483에 남긴다.
- API·Web BFF의 JavaScript artifact와 TypeScript source map은 Backlog인 PROD-516에 남기고 기존 `tsx` 실행을 유지한다.

## Authority / Provenance

- Canonical: 없음. 이 변경의 제품·보안 계약은 현재 Linear 이슈가 소유한다.
- Linear Contract: PROD-477
- Linear Implementations: PROD-484, PROD-493

## Capabilities

### New Capabilities

- `production-error-observability`: API, Web BFF와 Web browser의 처리되지 않은 오류 수집, event 전달 정책, release·source map 연결과 운영 검증 계약

### Modified Capabilities

없음.

## Impact

- `apps/api`, `apps/web`, `apps/app`의 오류 경계와 런타임 초기화
- Docker/Expo Web 빌드, GitHub Actions, Helm/Vault 배포 환경 변수와 source map 업로드
- Sentry JavaScript SDK 및 업로드 도구 의존성
- 오류 수집 설정, event 전달 정책, 배포 후 검증과 triage 운영 문서
