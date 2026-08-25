## Why

현재 Expo Web 공개 설정이 JavaScript bundle에 build-time으로 포함되어 같은 source SHA도 dev와 prod에서 서로 다른 image digest를 만든다. Browser 공개 설정을 runtime에 검증해 공급하고 환경 중립 artifact를 한 번만 build하면, 환경별 재build 비용과 drift를 없애고 승인된 production이 dev에서 검증한 exact digest를 승격할 수 있다.

## What Changes

- Web BFF가 allowlist된 공개 설정을 no-store runtime config로 제공하고, Web entrypoint가 React·Sentry·OpenPanel 초기화 전에 이를 검증한다.
- 잘못되거나 누락된 runtime config는 다른 환경의 기본값으로 fail-open하지 않고 명시적인 초기화 실패 상태를 만든다.
- Expo Web export와 Sentry source-map upload를 환경별 Sentry DSN·OpenPanel client ID·environment 이름에서 분리한다.
- Main의 환경 중립 canonical build가 runtime별 immutable image artifact set을 한 번 게시하고 dev와 prod가 같은 digest set을 사용한다.
- **BREAKING** Production approval은 prod 설정 image를 새로 build하는 경계에서 이미 검증된 exact artifact set을 production에 배포하는 경계로 바뀐다.
- PROD-831의 runtime별 image 분리는 유지하고 Android/iOS build-time API·OIDC 설정은 이번 변경에서 유지한다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain`·`docs/design` 문서 없음. Application domain·UI design은 변경하지 않는다.
- Linear Contract: `PROD-833`
- Linear Implementations: 없음.

## Capabilities

### New Capabilities

- `browser-runtime-config`: Web browser가 렌더링과 telemetry 초기화 전에 공개 runtime 설정을 안전하게 받아 검증하는 계약

### Modified Capabilities

- `production-release`: dev와 production이 환경별 build 대신 같은 source SHA의 canonical runtime image digest set을 소비하도록 release 계약 변경

## Impact

- Expo Web bootstrap과 public configuration 소비 경계
- Web BFF route, static fallback·cache 정책과 runtime configuration validation
- Browser Sentry·OpenPanel 초기화와 Sentry source-map upload
- Docker build inputs와 runtime별 image artifact set
- Main dev build/deploy, workflow_dispatch production release와 audit evidence
- Helm/Vault 환경 주입과 release runbook
