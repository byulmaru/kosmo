## Why

Kosmo Web 분석 runtime을 OpenPanel에서 PostHog로 전환하면서 PostHog가 기본 제공하는 page lifecycle, autocapture, 표준 metadata, persistence와 remote config를 앱 코드가 차단하거나 다시 구현해서는 안 된다. 다만 standard event payload의 개인정보 보호와 Session Replay privacy는 서로 다른 수집 경계로 관리해야 한다. Search query `q`는 표준 URL·session metadata 안에서 SDK 방식으로 마스킹하고, Replay는 별도의 Cloud 설정과 DOM marker로 보호한다.

## What Changes

- `@openpanel/web`을 제거하고 공개 key와 host가 모두 있을 때만 초기화되는 `posthog-js` Web adapter로 교체한다.
- `defaults: '2026-05-30'`을 사용해 PostHog의 표준 pageview·pageleave·autocapture·metadata·persistence·remote config 동작을 유지한다.
- 앱 소유 analytics API는 typed custom event와 opaque Account ID의 identify/reset, fail-open 경계로 제한한다. 수동 `$pageview`, route normalizer, runtime event allowlist와 범용 URL/referrer sanitizer를 두지 않는다.
- standard event payload는 `mask_personal_data_properties: true`와 `custom_personal_data_properties: ['q']`로 Search query를 마스킹한다. SDK 기본 광고 click ID 마스킹은 수용하고 `utm_*`는 유지하며, native masking이 놓치는 referrer URL의 `q`·기본 click ID와 파생 `ph_keyword` 계열만 공개 `before_send` hook으로 좁게 보완한다.
- Session Replay는 Cloud에서 10% sampling, production canonical origin, input·textarea masking과 canonical Post Content의 `ph-mask ph-no-capture`, 30일 retention으로 보호한다. Replay masking과 autocapture 제외는 standard event payload privacy와 별도 계약이다.
- Docker와 GitHub Actions는 같은 공개 project key·host를 build time에 주입하고 local·development는 기본 비활성화한다.
- 개인정보 처리방침·운영 runbook, 실제 replay 품질, production acceptance와 archive는 각각 PROD-795, PROD-741, PROD-575가 후속 검증한다.
- Android·iOS 공용 import는 명시적 no-op을 유지하고 Native bundle에 PostHog SDK를 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`의 Web/Native platform 경계
- Product authority: Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575`의 최신 결정
- Shared spec owner: [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820) / PR #685가 이 승인된 shared spec 전체를 소유하고, [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819) / PR #653는 그 Web runtime 계약을 소비한다.
- Masking approval: [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819)와 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-08-31 마스킹 정책 승인` 기록 — 사용자 정혜주(HJSmiley)가 “URL·referrer의 검색어 `q`와 광고 click ID는 가리고, `utm_*`는 보존하는 현재 정책을 유지·승인하시겠어요?”에 “마스킹 정책 승인”으로 답했다. 이 승인은 제품·사용자 승인으로, GitHub reviewer signoff나 production acceptance가 아니다. `2026-08-30` 구현 기록은 독립 authority가 아니다.
- Linear Implementations: `PROD-819` Web runtime, `PROD-820` Cloud·build/deployment, `PROD-795` 개인정보·운영 통합, `PROD-741` replay acceptance, `PROD-575` production acceptance·archive
- Lifecycle boundary: `PROD-795`, `PROD-741`, `PROD-575`가 각각 개인정보·운영 통합, replay acceptance, production acceptance·archive를 소유하며, 이 change는 그 결과를 대신 완료하거나 archive하지 않는다.

## Capabilities

### New Capabilities

- `web-product-analytics`: PostHog Web 표준 runtime, standard event payload privacy, typed custom event, Account identity, Cloud Replay privacy controls, build/deployment 주입, 장애 격리와 Native no-op 경계

### Modified Capabilities

없음. 기존 `add-web-openpanel-product-analytics`는 PROD-575가 대체된 change로 `--skip-specs` archive하고, 이 change를 정상 archive해 active spec으로 만든다.

## Impact

- `apps/app/src/analytics`, `apps/app/src/session`, `apps/app/src/components/post`: Web adapter, typed event·identity 경계와 Post Content replay masking·autocapture 제외
- `apps/web/e2e`: 표준 SDK outbound, identity와 fail-open 브라우저 검증
- `apps/app/package.json`, `pnpm-lock.yaml`: OpenPanel 제거와 PostHog 도입
- Docker와 GitHub Actions: 공개 build-time 설정 주입
- PostHog Cloud US `Kosmo Production`: standard remote config와 Session Replay privacy controls
- GraphQL/API, 데이터베이스 schema·migration과 Native SDK에는 영향 없음
