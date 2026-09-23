## ADDED Requirements

현재 PROD-741 세션은 아래 Replay 재활성화·acceptance 예시를 사용한다. 다른 이슈의 과거 수집 중단·cleanup 시나리오는 해당 시점의 범위이며 PR #955 이후 활성화된 Product Analytics를 다시 중단하는 지시가 아니다. 현재 요구사항의 권위는 Linear와 `docs/operations/posthog-replay.md`다.

### Requirement: 공개 설정 기반 PostHog Web 초기화

**Authority / Provenance:** `PROD-819`, `PROD-820`, `PROD-891`의 채널별 공개 설정 계약 — Kosmo Web은 선택된 채널의 공개 PostHog project key와 Cloud US ingestion host가 모두 제공될 때만 PostHog client를 초기화해야 한다(MUST). 둘 중 하나라도 없으면 분석 client와 network 전송은 생성되지 않아야 하며(MUST), OpenPanel client 또는 endpoint를 함께 초기화하지 않아야 한다(MUST).

#### Scenario: 공개 설정이 모두 존재한다

- **WHEN** 선택된 Web 채널에 공개 PostHog project key와 ingestion host가 모두 존재한다
- **THEN** PostHog Web client가 한 번 초기화되고 분석 호출은 그 client를 사용한다

#### Scenario: 공개 설정이 불완전하다

- **WHEN** 공개 PostHog project key 또는 ingestion host 중 하나 이상이 없다
- **THEN** 분석은 no-op이고 앱 렌더링·navigation·인증·mutation은 정상 동작한다

#### Scenario: 이전 provider 설정이 남아 있다

- **WHEN** Web runtime이 분석을 초기화한다
- **THEN** `@openpanel/web` client와 endpoint 전송은 생성되지 않는다

### Requirement: PostHog 표준 Web SDK 동작

**Authority / Provenance:** `PROD-819`, `PROD-820` — `PROD-820` / PR #685가 승인된 shared spec을 소유하고 `PROD-819` / PR #653가 Web runtime consumer로 동작하는 경계를 따른다. Kosmo Web은 `defaults: '2026-05-30'`을 사용하고 PostHog 표준 pageview·pageleave·autocapture, URL/referrer/session metadata, persistence와 remote config를 유지해야 한다(MUST). 앱 코드가 manual pageview, route normalizer, runtime event allowlist, property denylist 또는 `before_send` sanitizer로 이 동작을 대체하거나 차단하지 않아야 한다(MUST NOT).

#### Scenario: Web client가 초기화된다

- **WHEN** 유효한 공개 설정으로 PostHog Web client가 생성된다
- **THEN** init config는 공개 `api_host`와 `defaults: '2026-05-30'`을 사용한다
- **AND** 표준 자동 수집·metadata·persistence·remote config를 유지한다. Replay는 아래 재활성화 조건 충족 전까지 비활성 상태를 유지한다

#### Scenario: browser history가 바뀐다

- **WHEN** 사용자가 Web route를 처음 열거나 history navigation을 수행한다
- **THEN** PostHog SDK가 표준 `$pageview`와 `$pageleave` lifecycle을 소유한다
- **AND** 앱 소유 route observer가 중복 `$pageview`를 capture하지 않는다

#### Scenario: SDK가 표준 metadata를 만든다

- **WHEN** PostHog SDK가 `$current_url`, `$pathname`, referrer, session-entry 또는 protocol metadata를 event에 추가한다
- **THEN** adapter는 해당 metadata를 runtime filter로 제거하거나 projection하지 않는다
- **AND** Search `q`, 기본 campaign click ID와 referrer 파생 검색어를 포함한 URL·referrer·session metadata를 현재 수집 계약에 따라 원문으로 유지한다

#### Scenario: Cloud remote config가 필요하다

- **WHEN** feature flag, autocapture, performance, heatmap, console 또는 Session Replay 설정을 조회한다
- **THEN** SDK의 remote config와 필요한 external dependency loading이 차단되지 않는다

### Requirement: standard event 검색·캠페인 metadata 수집

**Authority / Provenance:** [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`) — 사용자 정혜주(HJSmiley)가 2026-08-31 마스킹 승인을 대체하고 표준 검색·캠페인 metadata 수집을 승인했다. Kosmo Web은 `mask_personal_data_properties: false`를 명시해야 하며(MUST), `custom_personal_data_properties`와 query·click metadata를 선택적으로 바꾸는 `before_send` hook을 두지 않아야 한다(MUST NOT). PostHog가 표준으로 생성하는 Search `q`, 기본 광고 click ID, referrer·session에서 파생되는 검색·캠페인 metadata와 `utm_*` attribution parameter를 앱 adapter가 변형·제거하지 않아야 한다(MUST). 앱 소유 custom event에는 검색어 원문을 새 property로 추가하지 않아야 한다(MUST NOT). 이 결정으로 `ph-mask ph-no-capture` Replay marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 변경하지 않는다.

#### Scenario: Search query와 click ID가 current와 session URL에 유지된다

- **WHEN** 사용자가 `?q=handle-marker&utm_source=feed&gclid=click-marker` URL로 진입하거나 history navigation을 수행한다
- **THEN** PostHog standard event payload의 current/session URL에 `q=handle-marker`가 유지된다
- **AND** `gclid=click-marker` 같은 기본 광고 click ID도 유지된다
- **AND** `utm_source=feed` 같은 `utm_*` attribution parameter는 유지된다

#### Scenario: referrer query와 파생 검색어가 유지된다

- **WHEN** 검색엔진 referrer URL에 `q=handle-marker`, 기본 click ID와 `utm_source=feed`가 포함되어 standard event metadata로 전달된다
- **THEN** referrer URL의 `q`와 기본 click ID가 원문으로 유지된다
- **AND** referrer 검색어에서 PostHog가 파생한 검색·캠페인 metadata도 원문으로 유지된다
- **AND** `utm_source=feed`는 유지한다
- **AND** adapter는 해당 metadata를 바꾸는 `before_send` hook을 적용하지 않는다

#### Scenario: standard payload와 Replay privacy를 구분한다

- **WHEN** standard event payload와 Session Replay가 같은 화면에서 수집된다
- **THEN** event payload는 검색·캠페인 metadata 원문 수집 계약을 적용한다
- **AND** Replay는 Cloud privacy 설정과 DOM marker 계약을 별도로 적용한다

### Requirement: app-owned custom event 계약

**Authority / Provenance:** `PROD-819`, `PROD-469` — Kosmo Web 공용 analytics API는 기존 app-owned custom event의 event별 property 타입으로 제한되어야 하며(MUST), typed properties는 PostHog capture에 그대로 전달해야 한다(MUST). app caller는 email·이름·handle·검색 원문·Post Content·오류 원문을 custom property로 전달하지 않아야 한다(MUST). `$pageview`는 SDK 소유이며 app-owned event contract에 포함하지 않아야 한다(MUST NOT).

- `profile_created`, `profile_selected`: `selected_profile_id`
- `post_created`: `selected_profile_id`, `visibility`
- `follow_succeeded`: `selected_profile_id`, `result`
- `search_submitted`: `tab`, `source`
- `search_results_loaded`: `tab`, `has_results`
- `search_result_selected`: `tab`

#### Scenario: 승인된 custom event가 전달된다

- **WHEN** caller가 event별 typed property로 adapter를 호출한다
- **THEN** adapter는 event name과 properties를 변형하지 않고 SDK capture에 전달한다

#### Scenario: event 계약에 맞지 않는 호출을 작성한다

- **WHEN** caller가 unknown event, 누락된 필수 property 또는 잘못된 value type을 전달한다
- **THEN** TypeScript 검증은 해당 호출을 거부한다

#### Scenario: app caller가 pageview를 보내려 한다

- **WHEN** app code가 `$pageview`를 custom event API로 호출하려 한다
- **THEN** TypeScript contract는 이를 허용하지 않는다

#### Scenario: 검색 결과 load는 fetchKey별 첫 renderable snapshot만 기록한다

- **WHEN** `store-and-network` 검색이 cache snapshot을 먼저 렌더링한 뒤 background network response로 결과를 변경하거나 재검증에 실패한다
- **THEN** `search_results_loaded`는 해당 `fetchKey`의 첫 renderable first-page snapshot에 대해 한 번만 전송된다
- **AND** cache snapshot 뒤의 결과 변경이나 network failure는 두 번째 성공 event 또는 실패 event를 전송하지 않는다
- **AND** cache miss의 first-page network failure에는 `search_results_loaded`를 전송하지 않는다

### Requirement: Account identity 수명주기

**Authority / Provenance:** `PROD-819`, `PROD-469` — Kosmo Web은 확인된 로그인 Session의 opaque Account ID만 PostHog distinct identity로 사용해야 한다(MUST). email·이름·handle 또는 Profile 속성을 identity trait로 보내지 않아야 하며(MUST), 공개 `get_property('$user_id')`와 `get_distinct_id()`를 기준으로 Account 전환과 guest reset을 판정해야 한다(MUST). `$user_state`, `identified` 같은 SDK 내부 persistence 값은 identity 계약에 사용하지 않아야 한다(MUST NOT).

#### Scenario: guest가 로그인한다

- **WHEN** 공개 `$user_id`가 없고 유효한 Account ID가 확인된다
- **THEN** PostHog는 opaque Account ID로 identify되고 별도 trait는 전송되지 않는다

#### Scenario: 같은 Account Session이 다시 관찰된다

- **WHEN** 공개 `$user_id`가 같은 Account ID이고 `get_distinct_id()`가 현재 persisted identity를 반환한다
- **THEN** reset하지 않고 같은 ID 처리와 retry를 PostHog SDK에 맡긴다

#### Scenario: 다른 Account로 전환한다

- **WHEN** 공개 `$user_id`와 다른 유효 Account가 확인되고 `get_distinct_id()`가 이전 identity를 반환한다
- **THEN** 이전 identity를 reset한 뒤 새 opaque Account ID를 identify한다

#### Scenario: reload 뒤 guest가 된다

- **WHEN** browser reload 뒤 module state는 비어 있어도 공개 `$user_id`가 identified Account로 남아 있고 유효한 Account Session이 없다
- **THEN** 이전 PostHog identity를 reset하고 이후 event가 그 Account에 연결되지 않게 한다

#### Scenario: browser reload가 identity persistence를 증명한다

- **WHEN** browser에서 Account A로 identify한 뒤 page를 reload하고 같은 Account A 또는 guest Session을 연다
- **THEN** adapter는 내부 persistence key를 읽지 않고 `get_property('$user_id')`와 `get_distinct_id()`로 전환을 판정한다
- **AND** 같은 A에서는 불필요한 reset을 하지 않고 guest에서는 이전 identity를 reset한다

### Requirement: Session Replay Cloud privacy controls

**Authority / Provenance:** `docs/operations/posthog-replay.md`, `PROD-741`의 2026-09-22 범위 결정·Spec 보강 요청, `PROD-820`의 Cloud 보호 계약과 수용된 main privacy baseline — PROD-741은 privacy baseline 수용, Cloud 실제 값과 코드·배포 준비를 입력으로 production Replay 재활성화 가능 여부를 판단하는 Replay Rollout Gate를 사용해야 한다(MUST). Spec Gate PASS와 구분하며 Replay Rollout Gate가 pending이면 실제 Replay를 켜지 않아야 한다(MUST NOT). Session Replay 10% sampling, production canonical origin, Normal input masking과 30일 retention은 Human-required 절차로 실제 값을 확인해야 한다(MUST). 조건 충족 후 재활성화와 실제 replay·masking·제품 장애 격리 acceptance를 별도로 수행해야 한다(MUST). Standard event metadata 수집 계약은 보존해야 한다(MUST).

#### Scenario: 확정된 privacy baseline과 Viewer를 사용한다

- **WHEN** PROD-741의 구현·검증 범위를 적용한다
- **THEN** 2026-09-22 현재 사용자 결정에 따라 당시 main의 개인정보처리방침을 완료된 privacy baseline으로 사용하며 과거 동일 결정의 존재를 blocker로 두지 않는다
- **AND** 법적 완결성을 새로 판단하거나 PROD-795의 정책·고지 책임을 재감사·수정하지 않는다
- **AND** 사용자가 직접 확인한 `Post Media Viewer Compact` / `Post Media Viewer Wide`를 검증 대상으로 사용하며 사전 시각 확인을 다시 요구하지 않는다

#### Scenario: Spec Gate만 통과했다

- **WHEN** Spec Gate는 PASS하고 privacy baseline은 수용됐지만 Cloud 실제 값·사전 검증·코드/배포/rollback 준비 중 미확인 입력이 남아 있다
- **THEN** Replay Rollout Gate는 pending이며 실제 Replay 비활성화를 유지한다
- **AND** 이 Gate를 PostHog 기능명 또는 사람이 Cloud를 설정하는 단계 하나로 해석하지 않는다

#### Scenario: Implement의 코드와 자동 검증을 완료한다

- **WHEN** A. Implement가 Luna Max로 runtime 구현과 앱 소유 config·identity·동기 fail-open·Post Content marker 자동 테스트, typecheck/lint/build를 완료한다
- **THEN** 코드·자동 검증 결과·대상 버전·남은 운영 항목을 B. Operational Verification에 인계하고 운영 검증을 기다리지 않고 종료한다
- **AND** A는 Cloud screenshot·실제 설정값·Replay Rollout Gate 최종 판정·실제 Replay 재활성화·실제 재생 시각 검증을 수행하지 않는다
- **AND** SDK recorder의 내부 bundle·payload·rrweb 형식과 기본 masking은 자동 테스트로 재검증하지 않으며 실제 recorder·masking·장애 격리는 B가 확인한다
- **AND** 남은 운영·실환경 검증과 PROD-741 최종 acceptance는 B가 소유하며 추가 필수 세션이나 PROD-575 후속 검증·archive에 의존하지 않는다

#### Scenario: Human-required Cloud screenshot을 확인한다

- **WHEN** B. Operational Verification 세션이 실제 Replay 재활성화 직전에 도달한다
- **THEN** Codex는 멈추고 해당 시점의 Cloud sampling·전체 origin/trigger 조건·privacy/masking·Data retention 화면과 캡처 범위를 사용자에게 안내한다
- **AND** 사용자가 제공한 저장된 설정 screenshot을 Codex가 직접 읽어 10%·production canonical origin만 허용·Normal·30일과 각각 대조한다
- **AND** PROD-820 Done·문서·기본값·과거 기록만으로 실제 설정 충족을 간주하지 않는다

#### Scenario: Cloud 값이 다르거나 화면으로 확인할 수 없다

- **WHEN** screenshot의 실제 값이 기대값과 다르거나 값·조건 전체를 판독할 수 없다
- **THEN** 현재 값 또는 미확인 이유, 기대값, 사람이 해야 할 조치, 미조치 시 pending인 Replay Rollout Gate 입력을 보고한다
- **AND** 추가 화면 또는 관련 필드만 남긴 실제 저장 설정 API 응답·관리자 내보내기를 요청한다. retention은 서버 설정으로 확인한다
- **AND** 사람의 수정·저장과 새 증거 대조 전까지 임의로 충족 처리하거나 실제 Replay를 켜지 않는다

#### Scenario: Human-required 조치가 필요하다

- **WHEN** B. Operational Verification에서 설정·재활성화·배포·복구 등에 사람의 조치가 필요하다
- **THEN** 정확한 대상·행위·기대 결과를 요청하고 사용자가 수행하거나 명시적으로 승인하기 전에 실행·완료 처리하지 않는다
- **AND** 승인 후에도 실제 실행·검증 증거를 확인하며 승인 자체를 성공 증거로 삼지 않는다

#### Scenario: 재활성화 조건을 충족했다

- **WHEN** 수용된 privacy baseline·Cloud 네 실제 값·사전 보호/장애 검증·코드/배포/rollback 준비로 Replay Rollout Gate가 PASS하고 기존 release 절차를 충족한다
- **THEN** B. Operational Verification에서 필요한 Human-required 조치를 충족한 뒤 Replay를 재활성화하고 대상·적용 시점을 기록한다
- **AND** 활성화 후 실제 Replay acceptance는 별도로 검증하며 Product Analytics의 기존 표준 수집과 제품 기능을 유지한다

#### Scenario: recording 비대상 origin에서 사용한다

- **WHEN** production canonical origin 외 환경에서 Web을 사용한다
- **THEN** 해당 환경의 실제 Replay는 전송되지 않는다
- **AND** 앱 소유 config·DOM marker 단위 검증이나 dev 무전송 smoke를 production 외 origin의 실제 수집 승인으로 해석하지 않는다

#### Scenario: 일반 route navigation과 Viewer를 함께 기록한다

- **WHEN** 합성 데이터로 일반 route navigation과 compact·wide Viewer 열기·이미지 전환·닫기를 수행한다
- **THEN** 하나의 실제 session replay에서 해당 journey가 정상적으로 기록·재생된다
- **AND** SDK의 기존 pageview·pageleave·autocapture가 같은 journey에 연결되는지 실제 Replay와 이벤트 결과로 확인한다
- **AND** Viewer 내부 이미지 전환은 route navigation이 아니므로 이를 위한 별도 pageview나 앱 소유 analytics emitter를 추가하지 않는다

#### Scenario: synthetic 입력과 canonical Post Content 보호를 검증한다

- **WHEN** synthetic input·textarea에 테스트 문자열을 입력하고 합성 canonical Post Content를 표시한다
- **THEN** 실제 Replay에서 input·textarea 내용이 masking되고 recorder 전송에 원문이 노출되지 않는다
- **AND** `ph-mask`의 Post Content 보호를 실제 Replay·전송 결과에서, `ph-no-capture`의 subtree 제외를 실제 autocapture 결과에서 각각 확인한다
- **AND** DOM marker 존재만으로 통과하지 않으며 실제 사용자 개인정보·실제 사용자 콘텐츠는 테스트에 사용하지 않는다

#### Scenario: analytics 또는 Replay가 실패한다

- **WHEN** Replay initialization·recorder load·upload 실패와 analytics 전송 실패를 각각 재현한다
- **THEN** 각 실패 발생을 확인하면서 Viewer 열기·이미지 전환·닫기, route navigation과 관련 제품 기능의 정상 동작을 별도 acceptance로 검증한다
- **AND** PostHog 성공을 제품 기능의 성공 조건으로 삼지 않으며 analytics/replay 실패가 제품의 실패·차단·대기로 전파되지 않는다

#### Scenario: 보호 실패가 발견된다

- **WHEN** masking 또는 recording 보호 조건이 충족되지 않는다
- **THEN** acceptance를 완료하지 않고 Replay 비활성 상태를 유지하거나 기존 release 절차로 회복한다

#### Scenario: 배포된 opt-out을 선택한다

- **WHEN** PROD-540 opt-out 기능이 배포돼 있고 사용자가 수집 거부를 선택했다
- **THEN** 해당 사용자의 Replay는 전송되지 않는다

#### Scenario: PROD-741 최종 acceptance 증거를 정리한다

- **WHEN** B. Operational Verification이 PROD-741 최종 acceptance를 판정한다
- **THEN** privacy baseline·Viewer 결정, A의 코드/자동 검증, Cloud 실제 값·비교 시점, Rollout Gate, 실제 재활성화·배포·표본 재생·장애 격리와 Human-required 실행 증거를 PROD-741에 정리한다
- **AND** 필수 결과가 미확인·실패면 완료하지 않으며 PROD-575 후속 인계·최종 acceptance·공유 OpenSpec archive를 완료 조건으로 두지 않는다
- **AND** 실제 Account ID·프로젝트 키·사용자 콘텐츠·raw recording payload를 기록하지 않는다
- **AND** 작은 표본의 녹화 비율로 10% 설정을 추정하거나 설정 screenshot만으로 실제 Replay acceptance를 완료하지 않는다

### Requirement: 분석 장애 격리

**Authority / Provenance:** `PROD-819`, `PROD-795` — PostHog 초기화, capture, identify, reset 또는 network 전송 실패는 Kosmo의 렌더링, navigation, 인증, mutation 결과와 기존 사용자 오류 처리를 실패시키거나 지연시키지 않아야 한다(MUST).

#### Scenario: SDK 초기화가 실패한다

- **WHEN** PostHog client 초기화가 throw하거나 사용할 수 없는 상태가 된다
- **THEN** analytics는 no-op으로 수렴하고 앱은 설정이 없는 경우와 동일하게 동작한다

#### Scenario: 전송 또는 identity 작업이 실패한다

- **WHEN** capture, identify, reset 또는 endpoint 전송이 실패한다
- **THEN** 원래 사용자 흐름은 analytics와 무관하게 그대로 완료한다

### Requirement: 채널별 공개 설정 경계

**Authority / Provenance:** [Linear `PROD-891`](https://linear.app/byulmaru/issue/PROD-891)의 공개 채널 설정, [Linear `PROD-833`](https://linear.app/byulmaru/issue/PROD-833)과 `docs/operations/production-release.md`의 SHA 이미지 승격 계약 — 공개 PostHog 설정은 코드의 채널 설정표에서 선택해야 하며(MUST), analytics build-time 주입을 복구하지 않아야 한다(MUST NOT). Web image release는 PROD-833의 검증된 SHA digest 승격 경계를 보존해야 한다(MUST).

#### Scenario: canonical Web image를 build한다

- **WHEN** 현재 채널 설정표를 포함한 canonical Web image를 build한다
- **THEN** OpenPanel·PostHog build argument 없이 build가 성공한다
- **AND** 조회·관리 credential은 공개 설정표·Web asset·image에 포함되지 않는다

#### Scenario: 현재 prod 수집 중단 상태를 보존한다

- **WHEN** PROD-839 cleanup을 검증한다
- **THEN** 실제 prod 채널의 PostHog 공개 설정 누락 상태와 analytics 무전송을 유지한다
- **AND** 격리된 가짜 공개 설정의 활성화 검증을 실제 prod 수집이나 재활성화 승인으로 해석하지 않는다

### Requirement: 전환 완료 후 OpenPanel 운영 설정 정리

**Authority / Provenance:** [Linear `PROD-839`](https://linear.app/byulmaru/issue/PROD-839)의 포함·제외 범위, 선행·후행 관계, 완료 조건과 2026-09-08 Issue Gate 정렬 승인; `PROD-819`의 runtime 전환, `PROD-820`의 전환기 주입, `PROD-891`의 현재 채널 설정, `PROD-833`과 `docs/operations/production-release.md`의 SHA 이미지 승격, `PROD-795`의 인계 계약 — PROD-819·PROD-820 결과가 같은 지원 release line에 포함되고 지원 canonical build·수동 SHA release·rollback 대상에 OpenPanel 소비가 없음을 확인한 뒤에만 남은 OpenPanel 전용 설정을 제거해야 한다(MUST). 지원되는 canonical rebuild가 있으면 그 대상도 확인해야 한다(MUST). 근거가 부족하면 남은 설정을 제거하지 않아야 하며(MUST NOT), 이미 사라진 주입을 복구하지 않아야 한다(MUST NOT). GitHub repository·사용 중인 environment variables, 활성 runtime configuration source·운영 설정 저장소의 참조와 제거 전후 이름·범위·환경·존재 여부를 기록해야 한다(MUST). 실제 값·credential·사용자 데이터를 기록하지 않아야 한다(MUST NOT). 현재 채널 설정, SHA digest 승격, prod 수집 중단과 기존 metadata·identity·privacy·Replay 계약을 보존해야 한다(MUST). 정리 결과와 남은 production 확인 사항은 PROD-795에 인계해야 한다(MUST). 과거 PROD-575 최종 acceptance 입력 계획은 현재 후속 의존성이 아니다.

#### Scenario: 정리 조건이나 근거가 부족하다

- **WHEN** 선행 결과가 같은 지원 release line에 포함되지 않았거나 OpenPanel 소비 대상 또는 미확인 지원 대상·설정 범위가 남아 있다
- **THEN** 남은 OpenPanel 전용 설정을 제거하지 않고 확인이 필요한 범위를 기록한다
- **AND** 이슈 Done, PR merge·Stack 순서, green CI와 일부 조회 결과로 gate를 대신하지 않는다

#### Scenario: 정리 조건을 모두 충족했다

- **WHEN** 같은 지원 release line과 모든 지원 대상의 OpenPanel 비의존 근거를 확보했다
- **THEN** 확인된 범위에 실제로 남은 OpenPanel 전용 참조와 외부 설정을 제거한다
- **AND** PostHog·기타 provider 설정과 수집 중단 상태를 보존한다
- **AND** repository·사용 environment·활성 설정 저장소의 이름·환경·범위·존재 여부를 제거 전후에 기록하되 실제 값·credential·사용자 데이터는 남기지 않는다

#### Scenario: 격리된 공개 설정으로 Web 경로를 검증한다

- **WHEN** OpenPanel 설정 없이 production-equivalent Web 경로를 검증한다
- **THEN** 격리된 가짜 PostHog key·host 네 조합으로 모두 존재할 때의 활성화와 하나 이상 누락 시 no-op을 확인한다
- **AND** 현재 실제 prod 채널의 무전송과 local·development 기본 비활성화를 별도로 확인한다
- **AND** 지원 build·release·rollback은 source full SHA·build run·image digest별 OpenPanel 비의존 근거로 확인한다
- **AND** production SHA release를 재빌드로 처리하거나 변수 삭제를 과거 image 변경·OpenPanel 비활성화 증거로 대체하지 않는다

### Requirement: Native no-op 경계

**Authority / Provenance:** `docs/design/breakpoints.md`, `PROD-819`, `PROD-537` — Android·iOS는 공용 analytics interface를 계속 제공하되 이번 Web slice의 PostHog 호출을 명시적 no-op으로 처리해야 한다(MUST). Native build graph와 bundle은 `posthog-js` 또는 `posthog-react-native` runtime을 포함하지 않아야 하며(MUST), 이 결과를 Native 분석 지원 완료 또는 영구 비지원 결정으로 해석하지 않아야 한다(MUST).

#### Scenario: 공용 analytics API를 Native에서 호출한다

- **WHEN** Android 또는 iOS runtime이 initialize, capture, identify 또는 reset API를 호출한다
- **THEN** network 전송과 identity 변화 없이 제품 동작이 계속된다

#### Scenario: Native bundle을 생성한다

- **WHEN** Android 또는 iOS bundle dependency graph를 검사한다
- **THEN** PostHog Web·Native SDK runtime이 포함되지 않는다
