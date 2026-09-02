## ADDED Requirements

### Requirement: 공개 설정 기반 PostHog Web 초기화

**Authority / Provenance:** `PROD-819`, `PROD-820` — Kosmo Web은 공개 PostHog project key와 Cloud US ingestion host가 모두 제공된 build에서만 PostHog client를 초기화해야 한다(MUST). 둘 중 하나라도 없으면 분석 client와 network 전송은 생성되지 않아야 하며(MUST), OpenPanel client 또는 endpoint를 함께 초기화하지 않아야 한다(MUST).

#### Scenario: 공개 설정이 모두 존재한다

- **WHEN** Web build에 공개 PostHog project key와 ingestion host가 모두 존재한다
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
- **AND** 표준 자동 수집·metadata·persistence·remote config를 비활성화하는 option을 전달하지 않는다

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

**Authority / Provenance:** [Linear `PROD-820`](https://linear.app/byulmaru/issue/PROD-820)의 `2026-09-02 검색·캠페인 메타데이터 비마스킹 결정` 댓글(`59d34cd1-96b2-446f-8a8d-3a48277f285a`) — 사용자 정혜주(HJSmiley)가 2026-08-31 마스킹 승인을 대체하고 표준 검색·캠페인 metadata 수집을 승인했다. Kosmo Web은 `mask_personal_data_properties: false`를 명시해야 하며(MUST), `custom_personal_data_properties`와 query·click metadata를 선택적으로 바꾸는 `before_send` hook을 두지 않아야 한다(MUST NOT). Search `q`, 기본 광고 click ID, referrer에서 파생된 `ph_keyword`·`$initial_ph_keyword`·`$session_entry_ph_keyword`와 `utm_*` attribution parameter는 PostHog standard event metadata에 원문으로 유지해야 한다(MUST). 앱 소유 custom event에는 검색어 원문을 새 property로 추가하지 않아야 한다(MUST NOT). 이 결정으로 `ph-mask ph-no-capture` Replay marker와 공개 `get_property('$user_id')`·`get_distinct_id()` identity API는 변경하지 않는다.

#### Scenario: Search query와 click ID가 current와 session URL에 유지된다

- **WHEN** 사용자가 `?q=handle-marker&utm_source=feed&gclid=click-marker` URL로 진입하거나 history navigation을 수행한다
- **THEN** PostHog standard event payload의 current/session URL에 `q=handle-marker`가 유지된다
- **AND** `gclid=click-marker` 같은 기본 광고 click ID도 유지된다
- **AND** `utm_source=feed` 같은 `utm_*` attribution parameter는 유지된다

#### Scenario: referrer query와 파생 검색어가 유지된다

- **WHEN** 검색엔진 referrer URL에 `q=handle-marker`, 기본 click ID와 `utm_source=feed`가 포함되어 standard event metadata로 전달된다
- **THEN** referrer URL의 `q`와 기본 click ID가 원문으로 유지된다
- **AND** referrer 검색어에서 파생된 `ph_keyword` 계열도 원문으로 유지된다
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

**Authority / Provenance:** `PROD-820`, `PROD-741`, `PROD-795`, `PROD-575` — production Web SDK 배포 전에 `Kosmo Production`은 Session Replay 10% sampling, production canonical origin 제한, input·textarea와 canonical Post Content masking, 30일 retention을 적용해야 한다(MUST). Standard event metadata 수집은 이 Replay 계약과 별도로 적용한다(MUST). PROD-741은 이 설정을 처음 활성화하지 않고 실제 replay 품질·masking·fail-open을 acceptance 해야 한다(MUST).

#### Scenario: production Session Replay 설정을 조회한다

- **WHEN** `Kosmo Production`의 Web recording 조건을 확인한다
- **THEN** sampling은 10%이고 URL 조건은 production canonical origin만 허용한다
- **AND** retention은 30일이다

#### Scenario: 사용자가 입력하거나 Post Content를 본다

- **WHEN** recording 대상 session에 input·textarea 값 또는 canonical Post Content가 렌더된다
- **THEN** input은 Cloud privacy mode로 mask되고 Post Content root는 PostHog 표준 `ph-mask ph-no-capture` marker를 제공한다
- **AND** `ph-mask`는 Replay text를 mask하고 `ph-no-capture`는 Post Content subtree의 autocapture를 제외한다

#### Scenario: Post Media Viewer replay를 검증한다

- **WHEN** PROD-741이 Viewer navigation과 화면 전환을 acceptance 한다
- **THEN** 보호 설정은 유지되고 replay failure는 Viewer와 제품 흐름에 영향을 주지 않는다

### Requirement: 분석 장애 격리

**Authority / Provenance:** `PROD-819`, `PROD-795` — PostHog 초기화, capture, identify, reset 또는 network 전송 실패는 Kosmo의 렌더링, navigation, 인증, mutation 결과와 기존 사용자 오류 처리를 실패시키거나 지연시키지 않아야 한다(MUST).

#### Scenario: SDK 초기화가 실패한다

- **WHEN** PostHog client 초기화가 throw하거나 사용할 수 없는 상태가 된다
- **THEN** analytics는 no-op으로 수렴하고 앱은 설정이 없는 경우와 동일하게 동작한다

#### Scenario: 전송 또는 identity 작업이 실패한다

- **WHEN** capture, identify, reset 또는 endpoint 전송이 실패한다
- **THEN** 원래 사용자 흐름은 analytics와 무관하게 그대로 완료한다

### Requirement: 공개 build/deployment 주입

**Authority / Provenance:** `PROD-820` — production-equivalent Web build는 같은 `Kosmo Production` project의 공개 key와 ingestion host를 Docker와 GitHub Actions 경계에서 함께 주입해야 한다(MUST). 환경별 실제 값과 credential은 repository source, Dockerfile default, image config 또는 layer history에 하드코딩하지 않아야 한다(MUST).

#### Scenario: production-equivalent Web image를 build한다

- **WHEN** 공개 PostHog key와 host를 build argument로 제공한다
- **THEN** compiled Web asset은 두 공개 설정을 사용하고 build가 성공한다
- **AND** client secret 또는 관리 credential은 asset과 image에 포함되지 않는다

#### Scenario: local 또는 development build를 실행한다

- **WHEN** 공개 key와 host가 모두 제공되지 않는다
- **THEN** PostHog client와 analytics network 전송은 생성되지 않는다

### Requirement: Native no-op 경계

**Authority / Provenance:** `docs/design/breakpoints.md`, `PROD-819`, `PROD-537` — Android·iOS는 공용 analytics interface를 계속 제공하되 이번 Web slice의 PostHog 호출을 명시적 no-op으로 처리해야 한다(MUST). Native build graph와 bundle은 `posthog-js` 또는 `posthog-react-native` runtime을 포함하지 않아야 하며(MUST), 이 결과를 Native 분석 지원 완료 또는 영구 비지원 결정으로 해석하지 않아야 한다(MUST).

#### Scenario: 공용 analytics API를 Native에서 호출한다

- **WHEN** Android 또는 iOS runtime이 initialize, capture, identify 또는 reset API를 호출한다
- **THEN** network 전송과 identity 변화 없이 제품 동작이 계속된다

#### Scenario: Native bundle을 생성한다

- **WHEN** Android 또는 iOS bundle dependency graph를 검사한다
- **THEN** PostHog Web·Native SDK runtime이 포함되지 않는다
