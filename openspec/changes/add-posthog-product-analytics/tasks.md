## 1. PROD-820 Cloud project와 privacy controls

**Authority / Provenance**

- `PROD-820`의 Cloud project·공개 설정·privacy control 계약
- `PROD-741`의 Session Replay acceptance 계약
- `PROD-575`의 production acceptance 계약

**Deliverable**

PostHog Cloud US의 `Kosmo Production` project에 production 배포 전 Replay sampling·origin·masking·retention 보호를 적용하고, 실제 값이나 credential을 노출하지 않는 운영 증거를 남긴다.

**Guardrails**

- Default project를 변경하지 않고 timezone은 `Asia/Seoul`로 유지한다.
- Session Replay는 production canonical origin에서만 10% sampling으로 수집하고 retention은 30일로 둔다.
- Normal input masking과 canonical Post Content의 `ph-mask` marker를 함께 적용한다.
- 공개 project key·host는 client artifact에 포함될 수 있지만 Personal API Key·Project Secret API Key 같은 조회·관리 credential은 repository·CI log·artifact에 기록하지 않는다.

**Verification**

- Cloud US region, project 이름, timezone과 Default project 불변을 확인한다.
- Replay 10% sampling, canonical origin 조건, Normal input masking과 30일 retention의 실제 설정 증거를 확인한다.
- canonical Post Content marker의 단위·browser 검증 가능 상태와 실제 값 비노출 운영 기록을 확인한다.

- [x] 1.1 PostHog Cloud US의 `Kosmo Production`과 `Asia/Seoul` timezone을 확인하고 Default project를 변경하지 않는 경계를 기록한다.
- [x] 1.2 Session Replay sampling 10%, production canonical origin URL 조건, Normal input masking과 retention 30일을 production 배포 전에 적용한다.
- [x] 1.3 canonical Post Content의 PostHog `ph-mask` marker를 runtime에 연결하고 Cloud input masking과 함께 단위·browser acceptance가 가능한 상태로 만든다.
- [x] 1.4 공개 project key·host와 credential의 경계 및 실제 값 비노출 규칙을 연결 운영 가이드와 PROD-820 댓글에 기록한다.

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
- PR #653·#685 review에서 정렬한 PostHog 표준 SDK 동작 계약

**Deliverable**

PostHog의 `defaults: '2026-05-30'` 표준 pageview·pageleave·autocapture·metadata·persistence·remote config를 유지하고, 앱 소유 custom event만 event별 TypeScript 계약으로 제한해 typed properties를 변형 없이 전달한다.

**Guardrails**

- app-owned route observer·normalizer·manual `$pageview`를 두지 않는다.
- 표준 자동 기능 disable, memory persistence, property denylist, `before_send` sanitizer나 runtime event projection으로 SDK 동작을 차단하거나 재구현하지 않는다.
- `$pageview`는 app event map에 포함하지 않는다.
- E2E의 bot 판별 회피를 위해 production adapter에 test-only option이나 환경 변수 분기를 추가하지 않는다. Playwright fixture가 일반 browser user-agent·UA Client Hints brand와 비자동화 webdriver signal을 context에 제공한다.
- 새 제품 event나 event별 지표를 추가하지 않는다.

**Verification**

- init config가 `api_host`와 `defaults: '2026-05-30'` 중심이며 test-only production option이 없음을 단위 검증한다.
- custom event type error와 typed property passthrough를 type·unit test로 확인한다.
- 일반 browser user-agent·UA Client Hints brand와 비자동화 webdriver signal을 설정한 E2E fixture·fake endpoint로 SDK pageview·pageleave·autocapture, 표준 metadata·remote config 요청과 설정 누락 no-op을 확인한다.

- [x] 3.1 init config를 `api_host`, `defaults: '2026-05-30'` 중심으로 정리하고 자동 기능 disable, memory persistence, denylist와 sanitizer를 제거한다.
- [x] 3.2 앱 소유 route observer, route normalizer와 manual `$pageview`를 제거한다.
- [x] 3.3 `$pageview`를 app event map에서 제거하고 기존 custom event의 event별 typed passthrough를 유지한다.
- [x] 3.4 unit test에서 권장 defaults와 표준 metadata·remote config 비차단, custom event type contract를 검증한다.
- [x] 3.5 production adapter에 test-only 설정을 추가하지 않고 Playwright fixture의 일반 browser user-agent·UA Client Hints brand와 비자동화 webdriver signal로 fake endpoint E2E를 실행해 SDK automatic pageview·pageleave·autocapture, 표준 metadata와 설정 누락 no-op을 검증한다.

## 4. PROD-819 persisted identity와 fail-open

**Authority / Provenance**

- `PROD-819`의 Account identity·fail-open 계약
- `PROD-469`의 opaque Account identity 계약
- `PROD-795`의 개인정보·운영 통합 인계 계약

**Deliverable**

SDK persisted identity state를 기준으로 로그인·같은 Account 유지·Account 전환·guest 전환을 identify/reset 순서로 수렴시키고, analytics 초기화·전송 실패에도 렌더링·인증·navigation·mutation 결과를 유지한다.

**Guardrails**

- email·이름·handle·Profile 속성을 identity trait로 전송하지 않는다.
- 같은 identified Account는 불필요하게 reset하지 않고 다른 Account로 전환할 때만 reset 후 identify한다.
- Profile 선택은 Account identity 전환으로 취급하지 않는다.
- analytics 결과를 await하거나 기존 사용자 오류 처리에 합치지 않는다.
- module-local Account cache를 persisted identity의 authority로 사용하지 않는다.

**Verification**

- guest→A, persisted A→A, A→B, reload A→guest와 SDK failure sequence를 단위 검증한다.
- browser Session 전환에서 identify/reset 순서, trait 부재와 endpoint 실패 시 사용자 흐름 지속을 확인한다.
- app check, 관련 unit·browser test, Web·Native export와 formatting 결과를 PROD-795 handoff에 기록한다.

- [x] 4.1 module-local Account cache 대신 SDK persisted identity state를 기준으로 same Account, Account 전환과 guest reset을 구현한다.
- [x] 4.2 guest→A, persisted A→A, A→B, reload A→guest와 SDK failure sequence를 단위 검증한다.
- [x] 4.3 browser flow에서 identify/reset 순서, trait 부재와 endpoint 실패 시 인증·navigation 지속을 검증한다.
- [x] 4.4 app check, 관련 unit·browser test, Web·Native export와 formatting을 실행하고 결과를 PROD-795 handoff에 기록한다.

## 5. PROD-820 build/deployment 공개 설정 주입

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
- PR #653 consumer가 반영되기 전에 OpenPanel production 주입을 제거하지 않는다. 제거는 PROD-839가 소유한다.

**Verification**

- Dockerfile과 production workflow에서 공개 PostHog key·host의 동일한 주입 경계를 확인한다.
- key-only·host-only·둘 다 없음·둘 다 존재하는 네 조합과 공개 설정의 Web asset 포함을 확인한다.
- image config·history에서 credential marker 부재와 전환기 OpenPanel production 주입 유지를 확인한다.

- [x] 5.1 Docker build args와 Web build environment에 공개 PostHog key·host를 함께 전달한다.
- [x] 5.2 GitHub production release workflow가 같은 repository variables를 Docker build에 주입하고 OpenPanel 전환 순서를 유지한다.
- [x] 5.3 가짜 공개 설정 production-equivalent build와 image inspection으로 공개 설정·credential 경계를 검증한다.

## 6. PROD-795 개인정보·운영 통합

**Authority / Provenance**

- `PROD-795`의 개인정보 처리방침·runbook·cross-slice 검증 계약
- 그룹 1~5의 Cloud·runtime·build handoff
- `PROD-839`의 OpenPanel build/deployment·외부 설정 cleanup 계약

**Deliverable**

실제 PostHog 수집 surface와 Cloud 보호를 개인정보 처리방침·운영 runbook에 반영하고, PROD-819 runtime과 PROD-820 Cloud/build 결과가 결합된 production-equivalent Web 흐름을 검증한다.

**Guardrails**

- 표준 automatic event, URL/referrer/session metadata, persistence, remote config와 Replay 보호를 실제 동작보다 좁게 문서화하지 않는다.
- OpenPanel 운영 계약 제거 시 consumer·provider 전환 순서를 확인한다.
- PROD-839가 지원 release·rollback 경로의 OpenPanel 주입과 GitHub 외부 설정을 정리한 뒤 그 cleanup 증거를 입력으로 사용한다.
- production-equivalent 검증을 실제 production acceptance나 OpenSpec archive로 일반화하지 않는다.
- PROD-741 replay acceptance가 시작되기 전에 이 cross-slice gate를 완료한다.

**Verification**

- 개인정보 처리방침이 실제 수집 surface·masking·retention 경계와 일치하는지 확인한다.
- Cloud 설정·배포·장애 대응·수집 확인 runbook을 검증한다.
- 활성 Docker·workflow·GitHub 설정과 운영 문서에서 OpenPanel 계약이 제거되고 PostHog `ph-mask`는 유지되는지 확인한다.
- production-equivalent Web build에서 그룹 1~5의 설정·automatic event·identity·fail-open·Replay 보호를 함께 확인한다.

- [ ] 6.1 표준 automatic event, URL/referrer/session metadata, persistence, remote config와 Replay 보호를 실제 개인정보 처리방침에 반영한다.
- [ ] 6.2 Cloud 설정·배포·장애 대응·수집 확인 runbook을 작성하고 OpenPanel 운영 계약을 제거한다.
- [ ] 6.3 PROD-819와 PROD-820 결과를 production-equivalent Web flow에서 cross-slice 검증한다.

## 7. PROD-741 Session Replay acceptance

**Authority / Provenance**

- `PROD-741`의 Post Media Viewer Replay acceptance 계약
- `PROD-820`의 sampling·origin·masking·retention 설정 증거
- `PROD-795`의 선행 cross-slice gate
- 배포된 경우 `PROD-540`의 analytics opt-out 계약

**Deliverable**

production canonical origin의 Post Media Viewer 표본 session에서 navigation·전환·닫기 Replay와 masking을 확인하고, Replay 초기화·업로드 실패가 Viewer와 제품 흐름에 영향을 주지 않음을 증명한다.

**Guardrails**

- PROD-795 cross-slice gate가 끝나기 전에 acceptance를 시작하지 않는다.
- 10% sampling 설정값과 선택한 표본 replay 재생을 구분하며 작은 표본의 관찰 비율로 설정값을 추정하지 않는다.
- input·textarea와 canonical Post Content 원문이 recording에 포함되지 않아야 한다.
- production canonical origin 외 환경에서 Replay를 활성화하지 않는다.
- 추가 custom selector 정책을 현재 완료 조건으로 넓히지 않는다.
- PROD-540 opt-out이 배포된 경우 opt-out 사용자의 replay가 전송되지 않아야 한다.

**Verification**

- Post Media Viewer의 navigation·전환·닫기가 표본 replay에서 재생 가능한지 확인한다.
- input·textarea와 canonical Post Content masking, 10% sampling, production origin과 30일 retention을 실제 설정·recording 증거로 확인한다.
- Replay 초기화·업로드 실패에서도 Viewer와 사용자 흐름이 지속되는지 확인한다.
- 개인정보 처리방침·운영 문서가 실제 Replay 보호를 설명하고, 증거에 Account ID·project key·사용자 콘텐츠가 없는지 확인한다.

- [ ] 7.1 Post Media Viewer 표본 session의 navigation·전환·닫기 replay를 확인한다.
- [ ] 7.2 input·textarea와 canonical Post Content masking, 10% sampling, production origin과 30일 retention을 실제 recording에서 확인한다.
- [ ] 7.3 replay 초기화·업로드 실패가 Viewer와 제품 흐름에 영향을 주지 않음을 확인한다.

## 8. PROD-575 production acceptance와 archive

**Authority / Provenance**

- `PROD-575`의 production acceptance·OpenSpec lifecycle 계약
- 그룹 1~7의 구현·운영·Replay acceptance handoff
- `PROD-839`의 OpenPanel cleanup 증거
- `PROD-545`의 production release·public smoke 결과

**Deliverable**

actual production에서 PostHog 표준 runtime·typed custom event·identity·Replay 보호를 개인정보 없는 증거로 확인하고, old OpenPanel change와 현재 PostHog change를 정해진 순서로 archive한다.

**Guardrails**

- 그룹 1~7의 완료와 required validation을 확인하기 전 archive하지 않는다.
- 지원 release·수동 SHA rebuild·rollback 경로가 OpenPanel 설정에 의존하지 않는지 PROD-839 증거로 확인한다.
- production release 선택·승인·배포와 전체 public smoke는 PROD-545의 결과를 입력으로 사용하고 이 그룹에서 다시 소유하지 않는다.
- old `add-web-openpanel-product-analytics`는 active spec을 되돌리지 않도록 `--skip-specs`로 먼저 archive한다.
- 현재 `add-posthog-product-analytics`는 delta spec 동기화와 strict validation을 포함해 정상 archive한다.
- PR 하나의 Ready·merge만으로 전체 change 완료를 추론하지 않는다.

**Verification**

- production에서 표준 automatic event·metadata·remote config, typed custom event, identify/reset과 Replay 보호를 개인정보 없는 증거로 확인한다.
- PROD-545 production release와 public smoke, PROD-839 cleanup, PROD-741 replay acceptance 완료를 확인한다.
- old change의 `--skip-specs` archive 뒤 active spec이 PostHog 계약을 유지하는지 확인한다.
- 현재 change의 정상 archive와 strict validation, unresolved task·review thread 부재를 확인한다.

- [ ] 8.1 production에서 표준 자동 이벤트·metadata·remote config, typed custom event, identity/reset과 Replay 보호를 개인정보 없는 증거로 확인한다.
- [ ] 8.2 old `add-web-openpanel-product-analytics`를 `--skip-specs` archive한다.
- [ ] 8.3 `add-posthog-product-analytics`를 정상 archive하고 strict validation을 통과시킨다.
