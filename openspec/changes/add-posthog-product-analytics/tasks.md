**Shared spec ownership**

- `PROD-820` / PR #685가 이 승인된 shared spec 전체를 소유한다. `PROD-819` / PR #653는 그 계약을 소비하는 Web runtime 구현을 소유한다.
- `PROD-839`는 선행 release 반영과 지원 build·rebuild·rollback 확인 뒤 OpenPanel build/deployment·외부 설정 cleanup과 그 증거를 소유한다.
- 현재 metadata 수집 결정은 [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`)을 근거로 한다. 사용자 정혜주(HJSmiley)가 2026-08-31 마스킹 승인을 대체했으며, 이 결정은 GitHub reviewer signoff나 production acceptance가 아니다.
- `PROD-795`의 정책·고지 책임은 별도 범위다. `PROD-741`은 아래 그룹 7의 두 세션으로 자체 최종 acceptance를 소유한다. `PROD-575`의 향후 acceptance·archive 전제는 과거 계획이며 현재 의존성이 아니다.

## 1. PROD-820 Cloud project와 privacy controls

**Authority / Provenance**

- `PROD-820`의 Cloud project·공개 설정·privacy control 계약
- `PROD-741`의 Session Replay acceptance 계약
- `PROD-575`의 과거 production acceptance 계획(현재 후속 의존성 아님)

**Deliverable**

PostHog Cloud US의 `Kosmo Production` project에 production 배포 전 Replay sampling·origin·masking·retention 보호를 적용하고, 실제 값이나 credential을 노출하지 않는 운영 증거를 남긴다.

**Guardrails**

- Default project를 변경하지 않고 timezone은 `Asia/Seoul`로 유지한다.
- Session Replay는 production canonical origin에서만 10% sampling으로 수집하고 retention은 30일로 둔다.
- Normal input masking과 canonical Post Content의 `ph-mask ph-no-capture` marker를 함께 적용한다. 이 Replay 계약은 standard event metadata 수집과 별도로 검증한다.
- 공개 project key·host는 client artifact에 포함될 수 있지만 Personal API Key·Project Secret API Key 같은 조회·관리 credential은 repository·CI log·artifact에 기록하지 않는다.

**Verification**

- Cloud US region, project 이름, timezone과 Default project 불변을 확인한다.
- Replay 10% sampling, canonical origin 조건, Normal input masking과 30일 retention의 실제 설정 증거를 확인한다.
- canonical Post Content marker의 단위·browser 검증 가능 상태와 실제 값 비노출 운영 기록을 확인한다. Replay masking과 autocapture 제외가 함께 적용되는지 확인한다.

- [x] 1.1 PostHog Cloud US의 `Kosmo Production`과 `Asia/Seoul` timezone을 확인하고 Default project를 변경하지 않는 경계를 기록한다.
- [x] 1.2 Session Replay sampling 10%, production canonical origin URL 조건, Normal input masking과 retention 30일을 production 배포 전에 적용한다.
- [x] 1.3 canonical Post Content의 PostHog `ph-mask` marker를 runtime에 연결하고 Cloud input masking과 함께 단위·browser acceptance가 가능한 상태로 만든다.
- [x] 1.4 공개 project key·host와 credential의 경계 및 실제 값 비노출 규칙을 연결 운영 가이드와 PROD-820 결정에 기록한다.
- [x] 1.5 canonical Post Content root에 `ph-mask ph-no-capture`를 적용하고, Replay masking과 autocapture 제외가 함께 동작하는지 outbound browser 증거로 확인한다.

## 2. PROD-819 Web adapter와 provider 교체

**Authority / Provenance**

- `PROD-819`의 Web analytics provider 교체 계약
- `PROD-820`의 공개 project key·ingestion host 소비자 계약
- `docs/design/breakpoints.md`의 Web/Native platform 경계

**Deliverable**

Kosmo Web이 공개 PostHog key와 host가 모두 있을 때만 PostHog adapter를 초기화하고, 설정 누락이나 SDK 실패에서는 제품 흐름을 유지하는 no-op으로 동작한다. OpenPanel runtime과 dependency를 제거하고 Native graph에는 PostHog runtime을 포함하지 않는다.

**Guardrails**

- OpenPanel과 PostHog를 dual-write하지 않는다.
- key와 host 중 하나라도 없으면 analytics network client를 만들지 않는다.
- `posthog-js` value import는 Web platform 경계에만 둔다.
- Web 검증 결과를 Native analytics 지원 완료로 일반화하지 않는다.

**Verification**

- key·host 네 조합, client 초기화 1회, SDK constructor·method failure와 OpenPanel 미초기화를 단위 검증한다.
- dependency manifest와 lockfile에서 `@openpanel/web` 제거 및 `posthog-js` 도입을 확인한다.
- Android·iOS export 또는 dependency graph에서 PostHog Web·Native runtime 부재를 확인한다.

- [x] 2.1 `pnpm` dependency 명령으로 `@openpanel/web`을 제거하고 `posthog-js`를 app dependency로 도입한다.
- [x] 2.2 공개 key와 host가 모두 있을 때만 초기화되고 SDK 오류를 격리하는 Web adapter와 Native no-op을 구현한다.
- [x] 2.3 설정 네 조합, singleton 초기화, SDK failure와 OpenPanel 부재를 단위 검증한다.
- [x] 2.4 Native export/dependency graph에서 PostHog runtime 비포함을 확인한다.

## 3. PROD-819 PostHog 표준 runtime과 typed custom event

**Authority / Provenance**

- `PROD-819`의 Web runtime·typed custom event 계약
- `PROD-469`의 기존 app-owned event taxonomy
- `PROD-820`의 standard event 검색·캠페인 metadata 수집 계약

**Deliverable**

PostHog의 `defaults: '2026-05-30'` 표준 pageview·pageleave·autocapture·metadata·persistence·remote config를 유지하고, 앱 소유 custom event만 event별 TypeScript 계약으로 제한해 typed properties를 변형 없이 전달한다.

**Guardrails**

- app-owned route observer·normalizer·manual `$pageview`를 두지 않는다.
- 표준 자동 기능 disable, memory persistence, property denylist, `before_send` sanitizer나 runtime event projection으로 SDK 동작을 차단하거나 재구현하지 않는다. `mask_personal_data_properties: false`를 명시하고 `custom_personal_data_properties`를 두지 않는다.
- `$pageview`는 app event map에 포함하지 않는다.
- E2E의 bot 판별 회피를 위해 production adapter에 test-only option이나 환경 변수 분기를 추가하지 않는다. Playwright fixture가 일반 browser user-agent·UA Client Hints brand와 비자동화 webdriver signal을 context에 제공한다.
- 새 제품 event나 event별 지표를 추가하지 않는다.

**Verification**

- init config가 `api_host`, `defaults: '2026-05-30'`, `mask_personal_data_properties: false`로 제한되고 test-only production option, `custom_personal_data_properties`와 `before_send`가 없음을 단위 검증한다.
- custom event type error와 typed property passthrough를 type·unit test로 확인한다.
- 일반 browser user-agent·UA Client Hints brand와 비자동화 webdriver signal을 설정한 E2E fixture·fake endpoint로 SDK pageview·pageleave·autocapture, 표준 metadata·remote config 요청과 설정 누락 no-op을 확인한다.

- [x] 3.1 init config를 `api_host`, `defaults: '2026-05-30'` 중심으로 정리하고 자동 기능 disable, memory persistence, denylist와 sanitizer를 제거한다.
- [x] 3.2 앱 소유 route observer, route normalizer와 manual `$pageview`를 제거한다.
- [x] 3.3 `$pageview`를 app event map에서 제거하고 기존 custom event의 event별 typed passthrough를 유지한다.
- [x] 3.4 unit test에서 권장 defaults와 표준 metadata·remote config 비차단, custom event type contract를 검증한다.
- [x] 3.5 production adapter에 test-only 설정을 추가하지 않고 Playwright fixture의 일반 browser user-agent·UA Client Hints brand와 비자동화 webdriver signal로 fake endpoint E2E를 실행해 SDK automatic pageview·pageleave·autocapture, 표준 metadata와 설정 누락 no-op을 검증한다.
- [x] 3.6 `mask_personal_data_properties: false`를 명시하고 `custom_personal_data_properties`와 query·click metadata `before_send` 보완을 제거하는 init config와 단위 검증을 추가한다.
- [x] 3.7 standard `/e/` event payload의 current/referrer/session URL E2E에서 Search `q`, current/referrer의 기본 click ID, 검색엔진 referrer에서 파생된 검색·캠페인 metadata와 `utm_*`가 원문으로 유지되는지 검증한다. 현재 lockfile `posthog-js@1.417.4`에서 E2E로 직접 확인한 `ph_keyword`와 SDK source prefix 로직으로 확인한 `$initial_ph_keyword`, `$session_entry_ph_keyword` 같은 개별 이름은 버전 종속적 검증 예시일 뿐 제품 계약이나 authority가 아니다. Remote config 요청과 Post Content `$autocapture` 비노출은 별도 경계로 계속 확인한다.

## 4. PROD-819 persisted identity와 fail-open

**Authority / Provenance**

- `PROD-819`의 Account identity·fail-open 계약
- `PROD-469`의 opaque Account identity 계약
- `PROD-795`의 개인정보·운영 통합 인계 계약

**Deliverable**

공개 `$user_id`와 `get_distinct_id()`를 기준으로 로그인·같은 Account 유지·Account 전환·guest 전환을 identify/reset 순서로 수렴시키고, analytics 초기화·전송 실패에도 렌더링·인증·navigation·mutation 결과를 유지한다.

**Guardrails**

- email·이름·handle·Profile 속성을 identity trait로 전송하지 않는다.
- 같은 identified Account는 불필요하게 reset하지 않고 다른 Account로 전환할 때만 reset 후 identify한다.
- Profile 선택은 Account identity 전환으로 취급하지 않는다.
- analytics 결과를 await하거나 기존 사용자 오류 처리에 합치지 않는다.
- module-local Account cache를 persisted identity의 authority로 사용하지 않는다.
- `$user_state`, `identified` 같은 SDK 내부 persistence 값을 identity 판정의 authority로 사용하지 않는다.

**Verification**

- guest→A, persisted A→A, A→B, reload A→guest와 SDK failure sequence를 공개 property 기반 단위 검증한다.
- 실제 browser reload를 포함한 Session 전환에서 identify/reset 순서, trait 부재와 endpoint 실패 시 사용자 흐름 지속을 확인한다.
- app check, 관련 unit·browser test, Web·Native export와 formatting 결과를 PROD-795 handoff에 기록한다.

- [x] 4.1 `$user_state`·`identified` 대신 공개 `$user_id`와 `get_distinct_id()`를 기준으로 same Account, Account 전환과 guest reset을 구현한다.
- [x] 4.2 공개 property 기반 guest→A, persisted A→A, A→B, reload A→guest와 SDK failure sequence를 단위 검증한다.
- [x] 4.3 실제 browser reload를 포함한 flow에서 identify/reset 순서, trait 부재와 endpoint 실패 시 인증·navigation 지속을 검증한다.
- [x] 4.4 app check, 관련 unit·browser test, Web·Native export와 formatting을 실행하고 결과를 PROD-795 handoff에 기록한다.

## 5. PROD-820 build/deployment 공개 설정 주입

이 그룹은 완료된 전환기 구현·검증 이력이다. 현재 주입 경로의 authority는 PROD-839의 2026-09-08 정렬 승인과 PROD-891·833이다. 아래 완료 checkbox는 당시 결과를 보존하며 현재 build-time 주입을 복구하는 작업이 아니다. 최신 cleanup 검증은 그룹 9가 소유한다.

**Authority / Provenance**

- `PROD-820`의 Cloud/build 공개 설정 계약
- `PROD-819`의 공개 project key·ingestion host 소비자 계약
- `PROD-839`의 OpenPanel 전환기 제거 후속 계약

**Deliverable**

Docker와 GitHub production release가 같은 공개 PostHog key·host를 Web build에 함께 주입하고, 기존 consumer가 main에 남은 전환 기간에는 OpenPanel production 주입도 유지한다.

**Guardrails**

- 공개 key·host는 일반 build args와 GitHub repository variables로 전달하고 cache key·build provenance에서 숨기지 않는다.
- 조회·관리 credential은 repository·CI log·build provenance·image artifact에 포함하지 않는다.
- key 또는 host가 부분적으로만 제공되면 PostHog adapter는 no-op이어야 한다.
- `PROD-819` consumer가 반영되기 전에 OpenPanel production 주입을 제거하지 않는다. 제거는 PROD-839가 소유한다.

**Verification**

- Dockerfile과 production workflow에서 공개 PostHog key·host의 동일한 주입 경계를 확인한다.
- key-only·host-only·둘 다 없음·둘 다 존재하는 네 조합과 공개 설정의 Web asset 포함을 확인한다.
- image config·history에서 credential marker 부재와 전환기 OpenPanel production 주입 유지를 확인한다.

- [x] 5.1 Docker build args와 Web build environment에 공개 PostHog key·host를 함께 전달한다.
- [x] 5.2 GitHub production release workflow가 같은 repository variables를 Docker build에 주입하고 OpenPanel 전환 순서를 유지한다.
- [x] 5.3 가짜 공개 설정 production-equivalent build와 image inspection으로 공개 설정·credential 경계를 검증한다.

## 9. PROD-839 OpenPanel 운영 설정 정리 (완료)

**Authority / Provenance:** [Linear `PROD-839`](https://linear.app/byulmaru/issue/PROD-839), PROD-891의 채널 설정, PROD-833과 `docs/operations/production-release.md`의 SHA 이미지 승격·rollback 계약.

**Deliverable:** 지원 build·release·rollback 경로가 OpenPanel 없이 동작하고 불필요한 외부 설정이 남지 않는 상태와 값 없는 전후 증거를 PROD-795에 인계한다.

**Guardrail:** 지원 대상의 비의존을 확인하기 전에는 설정을 제거하지 않으며, 미확인 범위를 부재로 처리하거나 실제 값·credential·사용자 데이터를 기록하지 않는다. 현재 채널 설정·SHA 승격과 다른 provider 설정을 보존한다. PR #955 이후 무전송 확인 대상은 OpenPanel이며 PostHog Product Analytics 요청은 실패로 취급하지 않는다.

**Progress (2026-09-22):** `af50250ef`의 source 주입 제거, 식별된 세 artifact의 비의존, production-equivalent·내부 production 실행 검증을 확인했다. 사용자 수동 삭제 후 18:23:41 KST names-only API로 repository scope의 `EXPO_PUBLIC_OPENPANEL_CLIENT_ID` 부재와 5개 environment의 OpenPanel 변수 부재를 재확인했다. 전후 목록·source SHA·build/release run·digest·실행 결과를 [PROD-795에 인계했다](https://linear.app/byulmaru/issue/PROD-795#comment-61cf8b63-7ce8-414f-9ce4-0666a6e6693f). 고정 rollback 지원 집합은 기존 결정이 없으므로 새 정책이나 과거 artifact 전체 검증을 요구하지 않는다. 공개 `https://kos.moe` Network와 문서·고지 잔여 참조는 미확인/후속 범위로 인계했으며 완료로 간주하지 않는다. PR #733의 과거 Ready·merge gate는 재개하지 않는다.

- [x] 9.1 같은 지원 release line과 지원 canonical build·SHA release·rollback 및 지원되는 canonical rebuild의 source SHA·build run·digest별 OpenPanel 비의존을 확인하고 설정 범위·미확인 항목을 목록화한다.
- [x] 9.2 이미 제거된 주입의 선행 SHA·현재 상태를 기록하고, gate 충족 후 남은 source 참조만 정리한다. 현재 채널 설정·SHA 승격과 PostHog 설정을 보존한다.
- [x] 9.3 gate와 대상 범위를 재확인한 뒤 실제 남은 외부 OpenPanel 전용 설정을 제거하고 이름·환경·범위·존재 여부만 전후 기록에 남긴다.
- [x] 9.4 격리된 가짜 설정의 활성화·누락 no-op, 현재 prod OpenPanel 무전송, production-equivalent Web export·image inspection과 지원 release·rollback 검증으로 OpenPanel 비의존을 입증한다.
- [x] 9.5 제거 전후 목록·환경·검증 결과·문서 잔여 참조·남은 production 확인 사항을 실제 값 없이 PROD-795에 인계한다. 과거 PROD-575 acceptance 입력 계획은 현재 후속 의존성이 아니다.

## 6. PROD-795 개인정보·운영 통합

**Authority / Provenance**

- `PROD-795`의 개인정보 처리방침·runbook·cross-slice 검증 계약
- 그룹 1~5의 Cloud·runtime·build handoff
- `PROD-839`의 OpenPanel build/deployment·외부 설정 cleanup 계약

**Deliverable**

실제 PostHog 수집 surface와 Cloud 보호를 개인정보 처리방침·운영 runbook에 반영하고, PROD-819 runtime과 PROD-820 Cloud/build 결과가 결합된 production-equivalent Web 흐름을 검증한다.

**Guardrails**

- 표준 automatic event, URL/referrer/session metadata, persistence, remote config와 Replay 보호를 실제 동작보다 좁게 문서화하지 않는다. Standard event payload의 `q`, 기본 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*`가 원문으로 수집될 수 있음을 명시한다.
- OpenPanel 운영 계약 제거 시 consumer·provider 전환 순서를 확인한다.
- PROD-839가 지원 release·rollback 경로의 OpenPanel 주입과 GitHub 외부 설정을 정리한 뒤 그 cleanup 증거를 입력으로 사용한다.
- production-equivalent 검증을 실제 production acceptance나 OpenSpec archive로 일반화하지 않는다.
- 당시 PROD-741 이전 cross-slice gate 계획은 현재 privacy baseline 수용 결정으로 대체됐다. 그룹 6의 미완료 항목을 PROD-741의 재감사·수정 blocker로 가져오지 않는다.

**Verification**

- 개인정보 처리방침이 실제 `q`·click metadata 수집 surface와 Replay masking·retention 경계에 일치하는지 확인한다.
- Cloud 설정·배포·장애 대응·수집 확인 runbook을 검증한다.
- 활성 Docker·workflow·GitHub 설정과 운영 문서에서 OpenPanel 계약이 제거되고 PostHog `ph-mask ph-no-capture`는 유지되는지 확인한다.
- production-equivalent Web build에서 그룹 1~5의 설정·automatic event·identity·fail-open·Replay 보호를 함께 확인한다.

- [ ] 6.1 표준 automatic event, URL/referrer/session metadata, persistence, remote config와 Replay 보호를 실제 개인정보 처리방침에 반영한다.
- [ ] 6.2 Cloud 설정·배포·장애 대응·수집 확인 runbook을 작성하고 OpenPanel 운영 계약을 제거한다.
- [ ] 6.3 PROD-819와 PROD-820 결과를 production-equivalent Web flow에서 cross-slice 검증한다.

## 7. PROD-741 조건부 Replay 재활성화와 Viewer acceptance

**Authority / Provenance**

- `PROD-741`의 2026-09-22 사용자 범위 결정·Spec 보강 요청과 `docs/operations/posthog-replay.md`
- `PROD-820`의 sampling·origin·masking·retention 계약. Done·문서는 현재 Cloud 값의 증거가 아니다.
- 2026-09-22 사용자가 현재 main privacy baseline 수용과 기존 compact·wide Viewer 시각 확인을 확정했다. 법적 완결성을 새로 판단하거나 PROD-795 정책·고지를 재감사·수정하지 않는다.
- 배포된 경우 `PROD-540`의 analytics opt-out 계약

**Deliverable / Guardrails**

Replay Rollout Gate는 production에서 실제 Replay를 재활성화해도 되는지 판단하는 checkpoint다. privacy baseline, 네 Cloud 실제 값과 코드·사전 검증·배포/rollback 준비를 입력으로 판정한다. PostHog 기능명이나 사람의 설정 작업 하나를 뜻하지 않는다. Spec Gate PASS만으로 Replay를 켜지 않는다. 활성화 후 실제 Replay acceptance도 별도로 남는다.

실제 사용자 개인정보·콘텐츠를 사용하지 않는다. production canonical origin 밖의 실제 Replay 전송, production sampling 100% 변경·강제 recording 우회, 추가 pageview·앱 소유 emitter·custom selector 정책·새 Storybook story·opt-out UI를 범위에 추가하지 않는다. sibling task와 공유 change archive는 완료 조건이 아니다. production 배포·rollback은 기존 release 절차를 따른다.

**Progress (2026-09-22)**

현재 branch의 Implement checkpoint는 `disable_session_recording: true`라는 명시적 차단을 제거했지만, production 배포·Cloud 실제 값·Replay 재활성화는 수행하지 않았다. 7.1의 privacy baseline 수용과 Viewer 시각 확인은 완료됐고, Spec Gate는 PASS다. A의 7.2–7.4 자동 검증은 완료했으며 Cloud screenshot·실제 값·배포/rollback 준비·실제 녹화가 미확인인 B의 7.5–7.9와 Replay Rollout Gate는 pending이다.

- [x] 7.1 2026-09-22 현재 사용자 결정: main 개인정보처리방침을 완료된 privacy baseline으로 수용하고 기존 Storybook `Post Media Viewer Compact` / `Post Media Viewer Wide`가 검증 대상임을 직접 확인했다. 과거 동일 결정의 존재는 blocker가 아니며 법적 완결성의 새 판단이나 PROD-795 정책·고지 재감사·수정을 포함하지 않는다.

**A. Implement — Luna Max (`gpt-5.6-luna`, reasoning `max`)**

코드와 자동화 가능한 검증만 수행한다. Cloud screenshot 판독·실제 설정 판정/변경·Replay Rollout Gate 최종 판정·실제 Replay 재활성화·실제 재생 시각 검증은 B의 책임이다.

- [x] 7.2 기존 adapter·Viewer·격리된 합성 fixture를 사용해 필요한 runtime 코드를 구현한다. `apps/app/src/analytics/client.web.ts`의 명시적 `disable_session_recording` 차단을 제거하고 SDK 표준 이벤트·identity·Native no-op과 기존 fail-open 경계를 보존했다. 실제 Cloud 전송·Replay 활성화·배포는 수행하지 않았다.
- [x] 7.3 synthetic data와 가짜 endpoint로 자동 검증 가능한 masking·autocapture 제외·fail-open 경계를 검증했다. `apps/web/e2e/analytics.e2e.ts`에서 실제 lockfile `posthog-js` lazy recorder를 사용해 initialization remote config 차단, recorder load 차단, snapshot upload 503, analytics endpoint 503을 각각 재현하고 route/pageview·Viewer·이미지 전환·identity 흐름의 성공을 대조했다. input·textarea와 `ph-mask ph-no-capture` Post Content marker가 snapshot/autocapture에 노출되지 않는지 gzip snapshot payload로 확인했으며 실제 사용자 개인정보·콘텐츠는 사용하지 않았다.
- [x] 7.4 변경 범위의 typecheck·lint·focused test·build를 완료하고 코드·자동 검증 결과·대상 version·남은 운영 항목을 B에 handoff한다. 운영 검증을 기다리지 않고 A를 종료한다. A 완료는 PROD-741 전체 완료나 Replay Rollout Gate PASS가 아니다.

**B. Operational Verification**

코드 구현 외 남은 운영·실환경 검증과 최종 acceptance를 모두 소유한다. Human-required 조치는 정확한 대상·행위·기대 결과를 요청하고 사용자가 수행하거나 명시적으로 승인하기 전에는 실행·완료 처리하지 않는다. 승인 후에도 실제 실행·검증 증거가 필요하다.

- [ ] 7.5 실제 재활성화 직전에 반드시 멈춰 Human-required Cloud 확인을 요청한다. canonical 캡처 표에 따라 당시 UI의 sampling·전체 origin/trigger 조건·privacy/masking·Data retention 화면을 안내한다. 사용자가 screenshot을 제공하면 Codex가 이미지를 읽어 10%·production canonical origin·Normal·30일과 대조한다. 불완전한 화면은 추가 screenshot 또는 관련 필드만 추린 실제 설정 API 응답·관리자 내보내기로 보완한다. 불일치는 현재 값·기대값·사람의 조치·pending인 Replay Rollout Gate 입력으로 보고하고 새 증거를 재확인한다.
- [ ] 7.6 privacy baseline, 7.5의 실제 Cloud 값, A의 코드·자동 검증 결과와 대상 버전·배포/rollback 준비로 Replay Rollout Gate를 판정한다. PASS와 필요한 Human-required 조치·기존 release 절차 충족 후에만 실제 재활성화를 진행하고 대상·적용 시점·실행 증거를 기록한다. Spec Gate PASS를 대신 사용하지 않는다.
- [ ] 7.7 합성 journey의 일반 route navigation과 compact·wide Viewer 열기·이미지 전환·닫기를 하나의 실제 session replay에서 재생하고 기존 SDK pageview·pageleave·autocapture 연결을 확인한다. synthetic input·textarea의 실제 masking·recorder 전송 전 보호, canonical Post Content의 `ph-mask` 실제 재생 비노출·`ph-no-capture` 실제 autocapture 제외, 비대상 origin 미전송을 확인한다. Viewer 내부 전환을 위한 별도 pageview·앱 소유 emitter는 추가하지 않는다. PROD-540이 배포됐다면 opt-out·재방문 뒤 미전송도 확인하고 미배포면 조건부 미적용으로 기록한다.
- [ ] 7.8 A의 자동 검증을 입력으로 필요한 실환경 장애 격리 acceptance를 수행한다. Replay initialization·recorder load·upload와 analytics 전송 실패에도 Viewer·route navigation·관련 제품 기능이 정상 동작하는지 별도 증거를 남긴다. 보호 실패 시 acceptance를 보류하고 필요한 Human-required 조치를 요청해 Replay 비활성 상태 회복을 확인한다.
- [ ] 7.9 baseline·Viewer 결정, A의 코드/자동 검증, Cloud 네 실제 값·Gate 판정, 재활성화·배포, 실제 재생·masking·장애 격리, 필요한 Human-required 조치의 수행/승인과 실행 증거를 PROD-741 자체의 최종 acceptance로 정리한다. 필수 결과가 미확인·실패면 완료 처리하지 않는다. 실제 ID·key·사용자 콘텐츠·raw payload는 제외한다. PROD-575로의 후속 인계·최종 검증·공유 OpenSpec archive를 완료 조건으로 두지 않는다.

추가 Test·Review·세 번째 운영 세션을 필수로 만들지 않는다. B에서 코드 결함이 발견되면 같은 A에 보완을 돌린 뒤 B를 재개한다.

## 8. PROD-575 과거 계획과 확인 범위

이전 그룹 8의 production acceptance·두 analytics change archive checklist는 현재 사용자의 책임 결정으로 대체됐다. PROD-741이 향후 결과를 PROD-575에 인계하거나 PROD-575가 후속 최종 acceptance·archive를 수행해야 한다는 의존성을 두지 않는다. 과거 checklist를 완료한 것으로 표시하지도 않는다.

2026-09-22 연결된 Linear를 identifier와 UUID로 조회한 결과 PROD-575는 Jiyu Park 담당, Todo, completedAt null이었다. 사용자 설명과 차이가 있으며 완료 당시 PROD-741에 남긴 미완료 책임을 확인할 완료 기록은 없었다. 본문과 댓글 3개는 과거 후속 계획이다. 연결된 PR #404의 Jiyu Park 작성·2026-07-30 병합과 OpenPanel 구현 범위는 historical evidence로 유지하되 PostHog acceptance 완료로 일반화하지 않는다. 자세한 근거는 `docs/operations/posthog-replay.md`에 기록한다. PROD-575 본문·상태를 수정하거나 재개하지 않는다.
