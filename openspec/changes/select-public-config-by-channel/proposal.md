## Why

브라우저와 Native bundle에 공개되는 설정을 GitHub Variables와 Vault에서 반복 주입하면 같은 값의 source가 분산되고 Web image가 환경에 묶인다. [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)은 공개 설정을 코드의 공용값과 `dev`/`prod` 채널값으로 관리하고 각 플랫폼이 채널만 선택하도록 요구한다.

## What Changes

- 공용 공개 설정과 `dev`/`prod`별 설정을 합성한 완전한 타입 설정표를 추가한다.
- Web BFF가 cache하지 않는 same-origin script로 검증된 채널 하나만 제공하고 Web client가 bundle 시작 전에 이를 선택한다.
- Native local development는 `dev`, release binary는 `prod` 설정을 선택한다.
- client 공개 설정을 읽기 위한 `EXPO_PUBLIC_*` 환경변수와 전용 Vault/VSO/ACL 전달 경로를 제거한다.
- 서버 비밀값과 release/build metadata는 공개 설정표 밖의 기존 배포 경계에 유지한다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 또는 `docs/design` 계약 없음.
- Linear Contract: [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)
- Linear Implementations: PROD-891

## Capabilities

### New Capabilities

- `channel-selected-public-config`: Web·Android·iOS client가 공용값과 배포 채널별 값으로 구성된 공개 설정을 선택하는 계약

### Modified Capabilities

없음.

## Impact

- `apps/app`: origin, Native OIDC, browser Sentry/PostHog 설정과 Web bootstrap
- `apps/web`: same-origin channel script 응답과 정적 asset 선행 route
- `.github/workflows`, `Dockerfile`, `apps/helm`: Expo 공개 설정 주입 및 전용 Vault Secret 경로 제거
- `apps/api`, `apps/web`: client 설정과 분리된 서버 Sentry runtime 이름 정렬
- `byulmaru/kubernetes` PR #96: 더 이상 필요하지 않은 전용 Vault read policy 폐기
