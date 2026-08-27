> 실행 순서: `PROD-819` 그룹 2·3·4와 `PROD-820` 그룹 1·5의 선행 범위를 정렬한 뒤, `PROD-795` 그룹 6·7 cross-slice gate를 통과하고, `PROD-741` 그룹 8을 수행한 다음 `PROD-575`가 최종 production acceptance/archive를 소유한다. 그룹 번호는 issue ownership을 나타내며 실행 순서와 동일하지 않을 수 있다.

## 1. PROD-820 PostHog Cloud·Session Replay retention 지속 계약

**Authority / Provenance**

- `PROD-820`의 최신 사용자 승인 Cloud·retention 계약
- `PROD-741`의 replay activation 소비자 계약
- PostHog 공식 Session Replay retention 문서(provider behavior reference)

**Deliverable**

PostHog Cloud US project의 region/timezone/수집 설정/Default project 불변과 Session Replay 초기 보존 기간 30일을 설정·증명한다. 이후 보존 기간은 현재 PostHog 플랜 지원 범위 안에서 운영 설정으로 변경할 수 있도록 실제 값·적용 시점·변경 근거를 기록하는 지속 계약과 설정 증거를 소유한다.

**Guardrails**

- 환경별 공개 project token·ingestion host는 repository·spec·test fixture에 하드코딩하지 않고 deployment variable에서 관리한다. Personal API Key·Project Secret API Key 같은 조회·관리 권한 credential은 repository·CI log·artifact에 기록하지 않는다.
- 초기 PostHog 기반 단계(PROD-819·PROD-795)에서는 Session Replay를 활성화하지 않는다. 실제 production activation은 PROD-741 gate가 소유한다.
- 초기 retention은 30일로 설정하고, 플랜 변경만으로 보존 기간을 자동 연장하지 않는다.
- 변경은 현재 PostHog 플랜 지원 범위 안에서만 허용하며, 설정 이후 수집되는 replay부터 적용한다.
- PostHog 공식 문서는 provider behavior reference일 뿐 제품 retention authority를 대체하지 않는다.

**Verification**

- Cloud US project의 region/timezone/수집 설정/Default project 불변과 Session Replay retention 설정 증거를 확인한다.
- PROD-741 activation 전 Session Replay가 비활성이고, activation에 사용할 retention 실제 설정값이 30일인지 확인한다.
- 실제 retention 값·적용 시점·적용 플랜·변경 근거를 운영 증거에 기록한다.
- 지원 범위 밖의 설정을 허용하지 않고, plan 변경만으로 자동 연장되지 않으며, 설정 변경이 이후 수집 replay에만 적용됨을 provider behavior와 운영 설정으로 확인한다.

- [ ] 1.1 Cloud US project의 region/timezone/수집 설정/Default project 불변 증거를 기록한다.
- [ ] 1.2 초기 PostHog 기반 단계의 Session Replay off와 activation 전 30일 retention 설정을 구성·검증한다.
- [ ] 1.3 보존 기간 변경 절차를 현재 플랜 지원 범위, 실제 값·적용 시점·변경 근거 기록, plan 변경 시 자동 연장 금지와 함께 운영 기록에 반영한다.
- [ ] 1.4 설정 변경 시 provider behavior 문서와 운영 절차에서 신규 replay 적용·기존 recording 정책 비자동 재작성·삭제 지연 가능성을 확인해 PROD-741과 PROD-795에 인계한다. 실제 recording 관찰은 이 그룹의 완료 조건이 아니다.

PostHog provider behavior note (non-normative): retention 만료 후 Session Replay recording 삭제가 즉시 완료되지 않을 수 있다. 30일은 제품 retention 설정값이며, 정확한 UI 삭제 SLA 또는 즉시 삭제 완료를 PROD-820의 완료 조건으로 해석하지 않는다.

## 2. PROD-819 PostHog Web adapter와 provider 교체

**Authority / Provenance**

- `PROD-819`
- `PROD-820`의 공개 project key·ingestion host 소비자 계약
- `docs/design/breakpoints.md`의 Web/Native platform 경계

**Deliverable**

Kosmo Web이 공개 PostHog key와 host가 모두 있을 때만 PostHog adapter를 사용하고, 설정 누락이나 SDK 실패에서는 제품 흐름을 유지하는 no-op으로 동작한다. OpenPanel runtime과 dependency는 제거되고 Native bundle은 PostHog SDK를 포함하지 않는다.

**Guardrails**

- OpenPanel과 PostHog를 dual-write하지 않는다.
- 환경별 공개 project token·ingestion host는 repository·test fixture에 하드코딩하지 않고 deployment variable에서 관리한다. Personal API Key·Project Secret API Key 같은 조회·관리 권한 credential은 repository·CI log·artifact에 기록하지 않는다.
- key와 host 중 하나라도 없으면 analytics network client를 만들지 않는다.
- PostHog value import는 Web platform 경계에만 두며 Native 분석 지원 완료로 일반화하지 않는다.

**Verification**

- key/host의 네 조합, client 초기화 1회, SDK constructor·method failure와 OpenPanel 미초기화를 단위 검증한다.
- dependency manifest와 lockfile에서 `@openpanel/web` 제거 및 `posthog-js` 단일 도입을 확인한다.
- Android·iOS export 또는 dependency graph에서 PostHog Web·Native runtime 부재를 확인한다.
- 테스트 코드 범위: `apps/app` analytics adapter unit test와 Native bundle/dependency 검증.
- 테스트 코드 승인 근거: `PROD-819` 포함 범위와 완료 조건의 adapter·Native no-op·OpenPanel 제거 검증.

- [ ] 2.1 `pnpm` dependency 명령으로 `@openpanel/web`을 제거하고 `posthog-js`를 app dependency로 도입해 manifest와 lockfile을 정렬한다.
- [ ] 2.2 공개 key와 host의 완전한 설정에서만 초기화되고 모든 SDK 오류를 격리하는 PostHog Web adapter를 구현하며 공용 Native no-op 계약을 유지한다.
- [ ] 2.3 설정 조합, singleton 초기화, capture failure와 OpenPanel 부재를 증명하는 adapter 단위 검증을 추가하고 통과시킨다.
- [ ] 2.4 Native export/dependency graph를 생성해 PostHog runtime 비포함을 확인하고 확인 범위와 미검증 platform을 기록한다.

## 3. PROD-819 route pageview와 outbound 개인정보 최소화

**Authority / Provenance**

- `PROD-819`
- `PROD-469`의 기존 승인 event taxonomy
- `PROD-575`의 PostHog 최소 수집·production acceptance 계약

**Deliverable**

Web route template 변화가 중복 없는 `$pageview`로 수집되고, 기존 승인 event만 event별 허용 property로 전송된다. 실제 URL 값, 자유 형식 입력·콘텐츠·오류와 승인되지 않은 event/property는 device를 떠나지 않는다.

**Guardrails**

- 초기 PROD-819 runtime에서 automatic pageview·pageleave, element autocapture, session replay, console, Web Vitals, performance와 heatmap 수집을 활성화하지 않는다. 후속 PROD-741 activation은 이 guardrail의 범위 밖에서 별도 gate로 소유한다.
- route group, 동적 segment 실제 값, query와 fragment를 pageview identity 또는 payload에 넣지 않는다.
- unknown event는 drop하고 extra property는 기본 허용하지 않는다.
- SDK-required transport/session metadata를 app property sanitizer의 generic key pattern으로 손상하지 않는다.
- 새 제품 event와 event별 지표는 이번 slice에 추가하지 않는다.

**Verification**

- 승인 event별 정확한 property, extra/sensitive property 제거와 unknown event drop을 단위 검증한다.
- static·dynamic·group route, 최초 pageview, route 전환, same-template dynamic/query 변화와 re-render dedupe를 단위 검증한다.
- fake 공개 설정을 사용한 browser 검증에서 route template당 한 건, 실제 handle·ID·query·fragment·자유 형식 값 부재와 automatic event 부재를 network payload로 확인한다.
- 테스트 코드 범위: analytics sanitizer·route observer unit test와 `apps/web/e2e`의 PostHog browser flow.
- 테스트 코드 승인 근거: `PROD-819` 포함 범위와 완료 조건의 개인정보 필터·pageview 단위·브라우저 검증.

- [ ] 3.1 기존 승인 taxonomy를 event별 허용 property로 정규화하고 unknown event를 drop하는 outbound 경계를 구현한다.
- [ ] 3.2 PostHog Web 설정에서 승인되지 않은 automatic telemetry를 명시적으로 비활성화하고 현재 SDK version의 option을 공식 type/source와 대조한다.
- [ ] 3.3 Expo Router의 안정적인 route template을 계산해 최초와 다른 template 전환에만 `$pageview`를 한 번 capture하는 Web 경계를 구현한다.
- [ ] 3.4 event allowlist, 민감·extra property, unknown event, route normalization과 pageview dedupe 단위 검증을 추가하고 통과시킨다.
- [ ] 3.5 fake PostHog endpoint를 사용한 browser 검증으로 실제 outbound payload, automatic event 부재와 설정 누락 no-op을 증명한다.

## 4. PROD-819 Account identity 수명주기와 slice 검증

**Authority / Provenance**

- `PROD-819`
- `PROD-469`의 opaque Account identity 계약
- `PROD-795`의 후속 개인정보·운영 통합 인계 조건

**Deliverable**

로그인, 같은 Account 유지, Account 전환과 로그아웃이 opaque Account ID의 identify/reset 순서로 수렴하고, analytics 설정·전송 실패에도 인증·navigation·mutation 결과가 유지된다. PROD-819가 소유한 adapter·pageview·sanitizer·identity slice의 자동·브라우저 검증 결과가 후속 통합 owner에게 인계된다.

**Guardrails**

- email·이름·handle·Profile 속성을 identity trait로 전송하지 않는다.
- Account A→B는 reset 후 identify하고 같은 Account는 중복 identify하지 않는다.
- Profile 선택은 Account identity 전환으로 취급하지 않는다.
- analytics 결과를 await하거나 기존 사용자 오류에 합치지 않는다.
- Cloud/build 설정, 개인정보 처리방침·runbook, actual production acceptance와 archive를 완료 처리하지 않는다.

**Verification**

- guest→A, A→A, A→B, A→guest, logout과 SDK failure sequence를 단위 검증한다.
- browser Session 전환에서 identify/reset order, trait 부재와 전송 실패 시 사용자 흐름 지속을 확인한다.
- `pnpm --filter @kosmo/app check`, 관련 unit·browser test, Web export와 `pnpm lint:prettier`를 통과시킨다.
- 테스트 코드 범위: analytics Session bridge·logout unit test와 `apps/web/e2e`의 identity/fail-open browser flow.
- 테스트 코드 승인 근거: `PROD-819` 포함 범위와 완료 조건의 식별 전환·전송 실패 단위·브라우저 검증.

- [ ] 4.1 guest·identified Account 상태 전이를 반영해 같은 Account dedupe, Account 교체 전 reset과 logout reset을 구현한다.
- [ ] 4.2 Session bridge와 logout 검증에 guest→A, A→A, A→B, A→guest, failure ordering을 추가하고 통과시킨다.
- [ ] 4.3 browser flow에서 identify/reset 순서, identity trait 부재와 analytics endpoint 실패 시 인증·navigation 지속을 증명한다.
- [ ] 4.4 app typecheck, 관련 unit·browser test, Web·Native export, formatting을 실행하고 실제 결과·검증 공백을 PROD-795 handoff에 기록한다.
- [ ] 4.5 각 독립 검증 checkpoint는 의도한 파일만 한국어 commit으로 남겨 `gh stack push`하고, 첫 정상 동작 checkpoint에서 Draft Stack PR을 생성·갱신해 범위·검증·남은 위험을 동기화한다.

## 5. PROD-820 Cloud/build 공개 설정 주입 경계

**Authority / Provenance**

- `PROD-820`의 최신 사용자 승인 Cloud/build 계약
- `PROD-819`의 공개 project key·ingestion host 소비자 계약

**Deliverable**

Cloud US project의 공개 project key와 ingestion host를 build/deployment에 주입하고, 둘이 모두 있을 때만 Web adapter가 초기화되는 설정 경계와 증거를 소유한다. 초기 PROD-819·PROD-795 단계의 Session Replay off를 유지한다.

**Guardrails**

- 환경별 공개 project token·ingestion host는 repository·spec·test fixture에 하드코딩하지 않고 GitHub Variables에서 Web build에 주입하며 최종 Web artifact에 포함될 수 있다. Personal API Key·Project Secret API Key 같은 조회·관리 권한 credential은 repository·CI log·build provenance·image artifact에 포함하지 않는다.
- key 또는 host가 부분적으로만 제공되면 analytics와 replay는 no-op이어야 한다.
- 초기 PostHog 기반 단계에서 Session Replay를 활성화하지 않으며, 후속 activation은 PROD-795 gate 이후 PROD-741이 소유한다.

**Verification**

- Cloud US host와 공개 key의 build/deployment 주입, key-only·host-only·둘 다 없음·둘 다 존재하는 네 조합의 설정 증거를 확인한다.
- PROD-819 consumer contract가 실제 key 값 없이 설정 완전성·초기 replay-off를 확인할 수 있도록 handoff한다.

- [ ] 5.1 Cloud US project의 공개 project token·ingestion host build/deployment 주입 경계를 정렬하고 조회·관리 권한 credential이 repository·CI log·build provenance·image artifact에 포함되지 않는다는 증거를 기록한다.
- [ ] 5.2 네 가지 설정 조합과 초기 Session Replay off 상태를 검증해 PROD-819·PROD-795에 인계한다.

## 6·7. PROD-795 production-equivalent cross-slice 검증 예약 ownership

**Authority / Provenance**

- `PROD-795`의 최신 사용자 승인 cross-slice 검증·activation block 계약

`PROD-795`가 그룹 6·7의 production-equivalent 개인정보·운영·rollout 검증을 소유하고, 해당 결과가 완료되기 전 `PROD-741` 그룹 8을 진행하지 않는다. 상세 backlog와 checkbox는 PROD-795 slice에서 구체화할 reserved ownership이며, 이번 retention 수정에서는 새로 발명하지 않는다.

## 8. PROD-741 production Web Session Replay 활성화·마스킹·초기 30일 검증

**Authority / Provenance**

- `PROD-741`의 최신 사용자 승인 activation·masking 계약
- `PROD-820`의 Cloud·retention 지속 계약과 설정 증거
- `PROD-575`의 최종 production acceptance 인계 계약

**Deliverable**

초기 replay-off 단계와 PROD-820의 30일 retention 설정·증거를 확인한 뒤 production canonical origin의 Web Session Replay를 10% sample로 활성화한다. 모든 `input`·`textarea` 값과 canonical Post Content renderer의 본문 텍스트가 replay에서 마스킹되는지 검증하고, 실제 replay와 초기 30일 보존 설정을 PROD-575에 인계한다.

**Guardrails**

- PROD-819·PROD-795 초기 단계와 PROD-795 그룹 6·7 gate가 끝나기 전 replay를 활성화하지 않는다.
- production canonical origin에서만 10% sample로 활성화하며, 다른 origin·환경에 replay를 켜지 않는다.
- 모든 `input`·`textarea` 값과 canonical Post Content renderer 본문은 activation 완료 전에 마스킹한다.
- 추가 custom selector 정책은 현재 완료 조건이 아니며, 별도 승인 없이 범위를 넓히지 않는다.
- PROD-820이 기록한 실제 retention 값·적용 시점·변경 근거를 확인하고 30일 초기값을 임의로 덮어쓰지 않는다.

**Verification**

- 초기 build에서 replay recording이 생성되지 않음을 확인한 뒤 activation gate를 통과시킨다.
- production canonical origin의 replay sample 설정값이 10%인지 확인하고, 별도로 선택한 표본 replay를 재생한다. observed recording 비율을 작은 표본으로 추정해 설정값을 증명하지 않는다.
- 입력·textarea 원문과 canonical Post Content renderer 본문이 replay에 노출되지 않음을 recording 증거로 확인한다.
- activation 시 retention이 30일이고 PROD-820의 실제 설정값·적용 시점·플랜 증거와 일치함을 확인한다.
- 추가 custom selector는 미검증·미포함 범위로 기록하고, activation·masking·retention 결과를 PROD-575 acceptance에 인계한다.

- [ ] 8.1 PROD-795의 그룹 6·7 gate 통과와 PROD-820의 30일 retention 설정·증거를 확인한다.
- [ ] 8.2 masking을 적용·검증한 뒤 production canonical origin의 Web Session Replay 설정값이 10% sample인지 확인하고 활성화한다.
- [ ] 8.3 별도로 표본 replay를 재생해 모든 `input`·`textarea` 값과 canonical Post Content renderer 본문 redaction, 다른 origin·환경의 replay 미생성을 검증한다.
- [ ] 8.4 실제 replay·retention 결과와 추가 custom selector 제외 범위를 PROD-575 acceptance에 인계한다.

최종 production acceptance와 `add-web-openpanel-product-analytics`의 `--skip-specs` archive는 PROD-575가 소유한다.
