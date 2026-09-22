## 현재 범위

이 change는 canonical·Linear 요구사항을 실행하기 위한 선택적 세션 하네스다. 이번 세션에서는 PROD-741의 조건부 Replay 재활성화와 Post Media Viewer 검증을 준비한다. 2026-09-22 사용자 결정과 `docs/operations/posthog-replay.md`를 따르며 이번 이슈의 작업은 tasks의 그룹 7에 있다. PROD-839의 cleanup과 PROD-795의 정책·고지 책임을 인수하지 않는다. 남은 작업은 Luna Max Implement와 Operational Verification 두 세션뿐이며, PROD-741의 최종 acceptance는 두 번째 세션이 소유한다. PROD-575로의 향후 인계·재개·archive 의존성은 제거한다.

PR #955 이후 조사 시점의 runtime은 Product Analytics만 활성화하고 Replay를 명시적으로 비활성화했다. Implement checkpoint는 해당 코드 차단을 제거했지만 production 배포·privacy baseline 수용·실제 Cloud 값과 코드·배포 준비를 포함한 Replay Rollout Gate가 PASS하기 전에는 production Replay를 재활성화하지 않는다. 아래 과거 PROD-839 문맥의 전체 prod 수집 중단은 당시 관측이며 현재 Product Analytics를 중단하는 지시가 아니다.

## PROD-741 Goal / Non-goals / Verification

- Goal: 선행 조건 충족 후 Web Replay를 재활성화하고, 10% sampling·production canonical origin·민감 텍스트 masking·30일 retention을 유지한 Viewer journey의 재생과 fail-open을 증명한다.
- Non-goals: 개인정보 정책 결정·고지 책임 인수, Cloud 최초 구성, 새 emitter·filter·custom selector·opt-out UI, Native SDK와 Post visibility 변경.
- Verification: 사용자의 기존 Storybook Viewer 시각 확인, 앱 소유 config·identity·동기 fail-open·Post Content marker 자동 검증, Human-required screenshot으로 확인한 네 Cloud 실제 값, 실제 route navigation·Viewer replay·SDK 이벤트·masking·장애 격리를 구분한다. PROD-540이 배포된 경우에만 opt-out 미전송을 추가 확인한다.
- Progress: 2026-09-22 사용자가 현재 main의 개인정보처리방침을 완료된 privacy baseline으로 수용하고 기존 compact·wide Viewer를 직접 확인했다. 법적 완결성의 새 판단이나 PROD-795 정책·고지 재감사·수정은 포함하지 않는다. 과거 동일 결정의 존재는 더 이상 blocker가 아니다. Spec Gate는 PASS이며, Implement A는 runtime 변경과 앱 소유 경계의 자동 검증을 완료했다. Replay Rollout Gate와 Cloud 실제 값·배포/rollback·실제 Replay·masking·장애 격리 acceptance는 B의 pending 범위다.
- Human-required: baseline 수용과 기존 Viewer의 사용자 시각 확인은 완료됐다. Operational Verification에서 실제 재활성화 직전에 Codex가 Cloud 화면 캡처 방법을 안내하고 사용자의 screenshot을 직접 읽어 10%·canonical origin·Normal·30일을 대조한다. 불일치는 현재 값·기대값·사람의 조치·pending Gate 입력으로 보고한다.

## 두 세션의 완료 경계

- Implement (Luna Max): runtime 구현과 앱 소유 config·identity·동기 fail-open·Post Content marker 자동 테스트, typecheck/lint/build 및 handoff. Cloud 실제 값·screenshot·Rollout 최종 판정·실제 재활성화·실제 recorder·masking·장애 격리 검증은 제외한다. 자동 검증이 끝나면 운영 확인을 기다리지 않고 Operational Verification에 인계한다.
- Operational Verification: screenshot의 10%·canonical origin·Normal·30일 판독, 불일치 조치 안내, Replay Rollout Gate 판정, PASS 후 실제 재활성화 절차, 실제 route/SDK/Viewer/masking·장애 격리 acceptance와 PROD-741 최종 증거. Human-required 조치는 사용자의 수행 또는 명시적 승인과 실행 증거 전까지 완료 처리하지 않는다.
- PROD-575 조회 상태와 사용자 설명의 차이는 canonical 운영 문서에 기록한다. 과거 완료 범위는 추정하지 않고, 이 차이를 PROD-741의 두 세션 착수 blocker로 만들지 않는다.

## Why

Kosmo Web 분석 runtime을 OpenPanel에서 PostHog로 전환하면서 PostHog가 기본 제공하는 page lifecycle, autocapture, 표준 metadata, persistence와 remote config를 앱 코드가 차단하거나 다시 구현해서는 안 된다. Standard event metadata와 Session Replay privacy는 서로 다른 수집 경계로 관리한다. Search query `q`와 click metadata는 분석 가치가 있는 표준 URL·referrer·session metadata로 유지하고, 사용자 Post Content는 별도의 Cloud 설정과 DOM marker로 보호한다.

## What Changes

- `@openpanel/web`을 제거하고 공개 key와 host가 모두 있을 때만 초기화되는 `posthog-js` Web adapter로 교체한다.
- `defaults: '2026-05-30'`을 사용해 PostHog의 표준 pageview·pageleave·autocapture·metadata·persistence·remote config 동작을 유지한다.
- 앱 소유 analytics API는 typed custom event와 opaque Account ID의 identify/reset, fail-open 경계로 제한한다. 수동 `$pageview`, route normalizer, runtime event allowlist와 범용 URL/referrer sanitizer를 두지 않는다.
- standard event payload는 `mask_personal_data_properties: false`를 명시해 Search `q`, 기본 광고 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`를 표준 metadata로 유지한다. `custom_personal_data_properties`와 선택적 query·click metadata `before_send` 보완은 두지 않는다.
- Session Replay는 Cloud에서 10% sampling, production canonical origin, input·textarea masking과 canonical Post Content의 `ph-mask ph-no-capture`, 30일 retention으로 보호한다. Replay masking과 autocapture 제외는 standard event metadata 수집과 별도 계약이다.
- 공개 project key·host는 PROD-891의 채널 설정표에서 선택한다. Web은 `ENVIRONMENT` → `/channel.js`로 채널을 전달받고, PROD-833의 canonical build와 SHA tag digest 승격을 따른다. Local·development 기본 비활성화와 현재 prod 수집 중단을 유지한다.
- PROD-839는 PROD-819·PROD-820이 같은 지원 release line에 반영되고 OpenPanel을 사용하는 지원 build·수동 SHA release·rollback 대상이 없음을 확인한 뒤, 현재 남은 Docker·workflow 참조와 GitHub repository·사용 중인 environment, 활성 runtime configuration source·운영 설정 저장소의 OpenPanel 전용 설정을 제거한다. 이미 제거된 항목은 선행 SHA와 현재 상태를 기록한다. 활성 배포 설정에 남은 참조와 제거 전후 상태를 실제 값 없이 기록한다.
- PROD-795 정책·고지 책임은 유지하며, 현재 main privacy baseline을 수용한 PROD-741은 자체 Operational Verification에서 Replay와 관련 최종 production acceptance를 완료한다. PROD-575 후속 검증·archive 전제는 과거 계획으로 대체한다.
- Android·iOS 공용 import는 명시적 no-op을 유지하고 Native bundle에 PostHog SDK를 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`의 Web/Native platform 경계
- Current OTA boundary: [Linear `PROD-335`](https://linear.app/byulmaru/issue/PROD-335), `docs/operations/expo-ota.md`와 현재 deploy workflow를 함께 대조한다. Native OTA export는 Web image 재빌드와 구분하며 이번 cleanup 범위를 넓히지 않는다.
- Current configuration/release authority: [Linear `PROD-891`](https://linear.app/byulmaru/issue/PROD-891)의 채널 설정 계약, [Linear `PROD-833`](https://linear.app/byulmaru/issue/PROD-833)의 SHA tag digest 승격 계약과 `docs/operations/production-release.md`. 기존 PROD-820 build-time 주입은 전환기 이력이며 현재 주입을 복구할 근거가 아니다.
- Product authority: Linear `PROD-819`, `PROD-820`, `PROD-839`, `PROD-795`, `PROD-741`의 최신 결정. `PROD-575`는 과거 계획·연결 evidence로만 참조한다
- Shared spec owner: [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820) / PR #685가 승인된 선행 shared spec 기준본을 소유하고, [Linear `PROD-819`](https://linear.app/byulmaru/issue/PROD-819) / PR #653는 그 Web runtime 계약을 소비한다. [Linear `PROD-839`](https://linear.app/byulmaru/issue/PROD-839)는 전환 후 OpenPanel 설정 정리 범위를 담당한다.
- Metadata collection approval: [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`) — 사용자 정혜주(HJSmiley)가 기존 마스킹 정책을 철회하고 Search `q`, 기본 click ID와 referrer·session에서 파생되는 검색·캠페인 metadata를 표준 metadata로 수집하기로 결정했다. 2026-08-31 승인은 Superseded 상태로 이력을 보존한다. 이 결정은 제품·사용자 승인으로, GitHub reviewer signoff나 production acceptance가 아니다.
- Linear Implementations: `PROD-819` Web runtime, `PROD-820` Cloud·build/deployment, `PROD-839` 전환 후 OpenPanel 설정 정리, `PROD-795` 개인정보·운영 통합, `PROD-741` 구현·자동 검증 및 자체 운영·최종 acceptance, `PROD-575` 과거 계획·연결 evidence
- Lifecycle boundary: `PROD-741`은 조건 충족 후 Replay 재활성화와 자체 최종 acceptance를 소유한다. `PROD-795` 정책·고지를 재감사하지 않으며 `PROD-575`의 미래 acceptance·archive를 기다리거나 요청하지 않는다. 현재 사용자 결정은 [PROD-741](https://linear.app/byulmaru/issue/PROD-741)의 2026-09-22 범위 결정과 `docs/operations/posthog-replay.md`에 기록한다. 이 세션 하네스는 제품 요구사항이나 배포 승인을 추가하지 않는다.

## Capabilities

### New Capabilities

- `web-product-analytics`: PostHog Web 표준 runtime, standard event metadata 수집, typed custom event, Account identity, Cloud Replay privacy controls, 채널 설정·SHA 이미지 승격과 전환 후 OpenPanel 설정 정리, 장애 격리와 Native no-op 경계

### Modified Capabilities

없음. 과거 PROD-575의 두 analytics change archive 계획은 현재 실행 의무가 아니다. 공유 OpenSpec 정리는 PROD-741 완료 조건으로 추가하지 않는다.

## Impact

- `apps/app/src/analytics`, `apps/app/src/session`, `apps/app/src/components/post`: Web adapter, typed event·identity 경계와 Post Content replay masking·autocapture 제외
- `apps/app/package.json`, `pnpm-lock.yaml`: OpenPanel 제거와 PostHog 도입
- Docker와 GitHub Actions: 현재 채널 설정·canonical build·SHA digest 승격을 보존하는 OpenPanel 잔여 참조 정리
- GitHub repository·environment variables와 활성 배포 설정: OpenPanel 전용 항목 확인·정리 및 값 없는 검증 근거
- PostHog Cloud US `Kosmo Production`: standard remote config와 Session Replay privacy controls
- GraphQL/API, 데이터베이스 schema·migration과 Native SDK에는 영향 없음
