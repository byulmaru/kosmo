## Context

Expo는 `EXPO_PUBLIC_*`를 Web bundle에 inline한다. 따라서 environment, browser Sentry DSN과 OpenPanel client ID를 build input으로 두면 같은 source SHA도 dev와 prod image가 달라진다. Web BFF는 이미 환경별 runtime 값을 받으므로 공개 browser 설정만 runtime JSON으로 전달할 수 있다.

## Goals

- 환경별 공개 설정을 image build에서 제거한다.
- main에서 만든 digest를 dev와 승인된 production이 그대로 사용한다.
- telemetry, same-origin BFF와 production approval 경계를 유지한다.

Native config, OTA, server secret 통합과 runtime image 경계 변경은 범위 밖이다.

## Approach

1. Web BFF가 `environment`, nullable Sentry DSN과 nullable OpenPanel client ID만 `/runtime-config.json`으로 반환한다.
2. Web entrypoint가 이 세 필드의 이름과 type을 확인한 뒤 telemetry와 React tree를 시작한다. 실패하면 간단한 retry 화면만 표시한다.
3. Browser Sentry와 OpenPanel은 검증된 runtime 값을 받고, Sentry release는 `kosmo@<full SHA>` build identity를 유지한다.
4. Docker build에서 환경별 browser 값을 제거하고 source map upload에 DSN을 요구하지 않는다.
5. Docker Build run이 source SHA와 build identity를 소유한다. 그 run의 artifact에는 runtime 이름과 `build-push-action`이 반환한 digest만 기록한다.
6. Dev는 자신을 시작한 성공한 Docker Build run의 artifact를 사용한다. Production preflight는 target SHA의 성공한 main Docker Build run과 artifact를 고정하고 승인 뒤 그 digest를 재build 없이 배포한다.

## Guardrails

- Runtime config는 secret, API origin 또는 confidential OIDC 값을 포함하지 않는다.
- Packaged JS, HTML과 gzip 파일을 runtime에 수정하지 않는다.
- Mutable tag를 배포 identity로 사용하지 않는다.
- Production credential과 Argo mutation은 `prod` 승인 뒤에만 실행한다.
- CI, dev rollout과 production rollout evidence를 구분한다.

## Verification

- Runtime config allowlist, type mismatch, HTTP failure와 retry
- Static cache, gzip, SPA fallback과 same-origin transport
- 환경별 build input 제거와 source map 제외
- Docker Build artifact의 digest를 dev/prod Argo parameter에 전달
- 별도 승인된 dev/prod live digest와 health

## Open Questions

없음.
