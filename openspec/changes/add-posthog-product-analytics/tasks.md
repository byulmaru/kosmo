## 2. PROD-819 PostHog Web adapter와 provider 교체

**Authority / Provenance**

- `PROD-819`
- `PROD-820`의 공개 project key·ingestion host 소비자 계약
- `docs/design/breakpoints.md`의 Web/Native platform 경계

**Deliverable**

Kosmo Web이 공개 PostHog key와 host가 모두 있을 때만 PostHog adapter를 사용하고, 설정 누락이나 SDK 실패에서는 제품 흐름을 유지하는 no-op으로 동작한다. OpenPanel runtime과 dependency는 제거되고 Native bundle은 PostHog SDK를 포함하지 않는다.

**Guardrails**

- OpenPanel과 PostHog를 dual-write하지 않는다.
- 실제 project key, credential 또는 secret을 repository·test fixture·log에 기록하지 않는다.
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

- automatic pageview·pageleave, element autocapture, session replay, console, Web Vitals, performance와 heatmap 수집을 활성화하지 않는다.
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
