## Why

Kosmo Web 분석 runtime을 OpenPanel에서 PostHog로 전환하면서 PostHog가 기본 제공하는 page lifecycle, autocapture, 표준 metadata, persistence와 remote config를 앱 코드가 차단하거나 다시 구현해서는 안 된다. Standard event metadata와 Session Replay privacy는 서로 다른 수집 경계로 관리한다. Search query `q`와 click metadata는 분석 가치가 있는 표준 URL·referrer·session metadata로 유지하고, 사용자 Post Content는 별도의 Cloud 설정과 DOM marker로 보호한다.

## What Changes

- `@openpanel/web`을 제거하고 공개 key와 host가 모두 있을 때만 초기화되는 `posthog-js` Web adapter로 교체한다.
- `defaults: '2026-05-30'`을 사용해 PostHog의 표준 pageview·pageleave·autocapture·metadata·persistence·remote config 동작을 유지한다.
- 앱 소유 analytics API는 typed custom event와 opaque Account ID의 identify/reset, fail-open 경계로 제한한다. 수동 `$pageview`, route normalizer, runtime event allowlist와 범용 URL/referrer sanitizer를 두지 않는다.
- standard event payload는 `mask_personal_data_properties: false`를 명시해 Search `q`, 기본 광고 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`를 표준 metadata로 유지한다. `custom_personal_data_properties`와 선택적 query·click metadata `before_send` 보완은 두지 않는다.
- Session Replay는 Cloud에서 10% sampling, production canonical origin, input·textarea masking과 canonical Post Content의 `ph-mask ph-no-capture`, 30일 retention으로 보호한다. Replay masking과 autocapture 제외는 standard event metadata 수집과 별도 계약이다.
- Docker와 GitHub Actions는 같은 공개 project key·host를 build time에 주입하고 local·development는 기본 비활성화한다.
- 개인정보 처리방침·운영 runbook, 실제 replay 품질, production acceptance와 archive는 각각 PROD-795, PROD-741, PROD-575가 후속 검증한다.
- PROD-795는 공개 개인정보 고지와 PostHog 운영 안내, production-equivalent 통합 증거를 구체적으로 정리한다. 표준 이벤트, `/flags`, Replay와 브라우저 저장소를 구분하고 실제 확인한 수집·보존·삭제 조건만 고지한다. PROD-839의 cleanup 증거가 나오기 전에는 OpenPanel 운영 계약 제거를 완료로 처리하지 않는다.
- Android·iOS 공용 import는 명시적 no-op을 유지하고 Native bundle에 PostHog SDK를 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`의 Web/Native platform 경계
- Product authority: Linear `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575`의 최신 결정
- 병합된 선행 구현 증거: [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 shared spec·Cloud/build slice는 PR #685의 merge commit `47fb36f52`로, [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819)의 Web runtime slice는 PR #653의 merge commit `2176b7e38`로 `main`에 반영됐고 두 이슈는 Done이다. PR #685가 shared spec을 소유하고 PR #653이 그 계약을 소비한 slice 경계는 병합 뒤에도 provenance로 유지한다.
- Metadata collection approval: [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`) — 사용자 정혜주(HJSmiley)가 기존 마스킹 정책을 철회하고 Search `q`, 기본 click ID와 referrer·session에서 파생되는 검색·캠페인 metadata를 표준 metadata로 수집하기로 결정했다. 2026-08-31 승인은 Superseded 상태로 이력을 보존한다. 이 결정은 제품·사용자 승인으로, GitHub reviewer signoff나 production acceptance가 아니다.
- Linear Implementations: `PROD-819` Web runtime과 `PROD-820` Cloud·build/deployment는 완료·병합, `PROD-795` 개인정보·운영 통합은 진행 중, `PROD-741` replay acceptance와 `PROD-575` production acceptance·archive는 후속 책임
- Lifecycle boundary: `PROD-795`, `PROD-741`, `PROD-575`가 각각 개인정보·운영 통합, replay acceptance, production acceptance·archive를 소유하며, 이 change는 그 결과를 대신 완료하거나 archive하지 않는다.
- PROD-795 refinement: [Linear `PROD-795`](https://linear.app/byulmaru/issue/PROD-795)의 `2026-08-31 명세 구체화 범위 확인`과 사용자 승인에 따라 개인정보 화면·운영 문서·통합 검증을 구체적으로 정리한다. 이 작업은 `main`에 병합된 PR #685의 shared spec과 PR #653의 Web runtime을 입력으로 사용하는 후속 slice이며, PROD-819/820의 구현 계약을 변경하지 않는다. 공개 `/privacy` 진입은 `docs/design/breakpoints.md`, Account·Session 경계는 `docs/domain/objects/account.md`와 `docs/domain/objects/session.md`에 따른다.

## Capabilities

### New Capabilities

- `web-product-analytics`: PostHog Web 표준 runtime, standard event metadata 수집, typed custom event, Account identity, Cloud Replay privacy controls, build/deployment 주입, 장애 격리와 Native no-op 경계

### Modified Capabilities

없음. 기존 `add-web-openpanel-product-analytics`는 PROD-575가 대체된 change로 `--skip-specs` archive하고, 이 change를 정상 archive해 active spec으로 만든다.

## Impact

- `apps/app/src/analytics`, `apps/app/src/session`, `apps/app/src/components/post`: Web adapter, typed event·identity 경계와 Post Content replay masking·autocapture 제외
- `apps/web/e2e`: 표준 SDK outbound, identity와 fail-open 브라우저 검증
- `apps/app/package.json`, `pnpm-lock.yaml`: OpenPanel 제거와 PostHog 도입
- Docker와 GitHub Actions: 공개 build-time 설정 주입
- PostHog Cloud US `Kosmo Production`: standard remote config와 Session Replay privacy controls
- `apps/app/src/app/privacy.tsx`, `docs/operations`의 분석·배포 안내와 `apps/web/e2e`: PROD-795의 고지·운영 전환과 통합 검증 대상. 이 Spec 단계에서는 실행 코드·공개 고지·Cloud 설정을 변경하지 않는다.
- GraphQL/API, 데이터베이스 schema·migration과 Native SDK에는 영향 없음
