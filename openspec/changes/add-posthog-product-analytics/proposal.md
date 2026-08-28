## Why

Kosmo Web 분석 runtime을 OpenPanel에서 PostHog로 전환하면서 PostHog가 기본 제공하는 page lifecycle, autocapture, 표준 metadata, persistence와 remote config를 앱 코드가 차단하거나 다시 구현해서는 안 된다. 동시에 Session Replay를 production에 적용하기 전 수집량, recording origin, input과 Post Content masking, retention을 Cloud에서 고정해야 한다.

## What Changes

- `@openpanel/web`을 제거하고 공개 key와 host가 모두 있을 때만 초기화되는 `posthog-js` Web adapter로 교체한다.
- `defaults: '2026-05-30'`을 사용해 PostHog의 표준 pageview·pageleave·autocapture·metadata·persistence·remote config 동작을 유지한다.
- 앱 소유 analytics API는 typed custom event와 opaque Account ID의 identify/reset, fail-open 경계로 제한한다. 수동 `$pageview`, route normalizer, runtime event allowlist와 URL/referrer sanitizer를 두지 않는다.
- Session Replay는 Cloud에서 10% sampling, production canonical origin, input·textarea masking과 canonical Post Content의 `ph-mask`, 30일 retention으로 보호한다.
- Docker와 GitHub Actions는 같은 공개 project key·host를 build time에 주입하고 local·development는 기본 비활성화한다.
- 개인정보 처리방침·운영 runbook, 실제 replay 품질, production acceptance와 archive는 각각 PROD-795, PROD-741, PROD-575가 후속 검증한다.
- Android·iOS 공용 import는 명시적 no-op을 유지하고 Native bundle에 PostHog SDK를 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`의 Web/Native platform 경계
- Linear Contract: `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575`
- Linear Implementations: `PROD-819` Web runtime, `PROD-820` Cloud·build/deployment, `PROD-795` 개인정보·운영 통합, `PROD-741` replay acceptance, `PROD-575` production acceptance·archive

## Capabilities

### New Capabilities

- `web-product-analytics`: PostHog Web 표준 runtime, typed custom event, Account identity, Cloud privacy controls, build/deployment 주입, 장애 격리와 Native no-op 경계

### Modified Capabilities

없음. 기존 `add-web-openpanel-product-analytics`는 PROD-575가 대체된 change로 `--skip-specs` archive하고, 이 change를 정상 archive해 active spec으로 만든다.

## Impact

- `apps/app/src/analytics`, `apps/app/src/session`, `apps/app/src/components/post`: Web adapter, typed event·identity 경계와 Post Content replay masking
- `apps/web/e2e`: 표준 SDK outbound, identity와 fail-open 브라우저 검증
- `apps/app/package.json`, `pnpm-lock.yaml`: OpenPanel 제거와 PostHog 도입
- Docker와 GitHub Actions: 공개 build-time 설정 주입
- PostHog Cloud US `Kosmo Production`: standard remote config와 Session Replay privacy controls
- GraphQL/API, 데이터베이스 schema·migration과 Native SDK에는 영향 없음
