## ADDED Requirements

### Requirement: 공개 설정 기반 PostHog Web 초기화

**Authority / Provenance:** `PROD-819`, `PROD-820` — Kosmo Web은 공개 PostHog project key와 Cloud US ingestion host가 모두 제공된 build에서만 PostHog client를 초기화해야 한다(MUST). 둘 중 하나라도 없으면 분석 client와 분석 network 전송은 생성되지 않아야 하며(MUST), OpenPanel client 또는 endpoint를 함께 초기화하지 않아야 한다(MUST).

#### Scenario: 공개 설정이 모두 존재한다

- **WHEN** Web build에 공개 PostHog project key와 ingestion host가 모두 존재한다
- **THEN** PostHog Web client가 한 번 초기화되고 분석 호출은 그 client를 사용한다

#### Scenario: 공개 설정이 불완전하다

- **WHEN** 공개 PostHog project key 또는 ingestion host 중 하나 이상이 없다
- **THEN** 분석은 no-op이고 앱 렌더링·navigation·인증·mutation은 정상 동작한다

#### Scenario: 이전 provider 설정이 남아 있다

- **WHEN** Web runtime이 분석을 초기화한다
- **THEN** `@openpanel/web` client와 OpenPanel endpoint 전송은 생성되지 않는다

### Requirement: 최소 수집 Web runtime

**Authority / Provenance:** `PROD-819`, `PROD-575` — Kosmo Web은 app-owned adapter가 명시적으로 보내는 route pageview와 승인된 제품 이벤트만 수집해야 한다(MUST). broad element autocapture, automatic URL pageview·pageleave, session replay, console, Web Vitals, performance와 heatmap 수집은 기본적으로 비활성화해야 하며(MUST), 별도 후속 Linear 계약 없이 활성화하지 않아야 한다(MUST).

#### Scenario: Web client가 초기화된다

- **WHEN** 유효한 공개 PostHog 설정으로 Web client가 생성된다
- **THEN** 자동 수집 기능은 비활성화되고 app-owned adapter의 명시적 capture만 전송 후보가 된다

#### Scenario: 사용자 입력이나 DOM 상호작용이 발생한다

- **WHEN** 명시적 analytics caller가 없는 입력, click, form 변화 또는 console 출력이 발생한다
- **THEN** PostHog 이벤트, replay 또는 성능 payload가 생성되지 않는다

### Requirement: outbound event 허용 목록

**Authority / Provenance:** `PROD-819`, `PROD-469`, `PROD-575` — Kosmo Web은 모든 outbound event를 event별 허용 목록으로 정규화해야 한다(MUST). SDK 전송·익명 session 유지에 필요한 protocol metadata를 제외한 app-owned property는 아래 목록만 허용하고(MUST), 임의 event·추가 property·email·이름·handle·검색 원문·Post Content·오류 원문·URL query·fragment와 credential·token 성격의 값을 전송하지 않아야 한다(MUST).

- `$pageview`: 정규화된 route template 표현
- `profile_created`, `profile_selected`: `selected_profile_id`
- `post_created`: `selected_profile_id`, `visibility`
- `follow_succeeded`: `selected_profile_id`, `result`
- `search_submitted`: `tab`, `source`
- `search_results_loaded`: `tab`, `has_results`
- `search_result_selected`: `tab`

#### Scenario: 승인된 event와 property가 전달된다

- **WHEN** caller가 승인된 event에 해당 event의 허용 property만 전달한다
- **THEN** adapter는 허용된 값과 SDK protocol metadata만 포함한 payload를 capture한다

#### Scenario: 허용 목록 밖의 property가 섞여 있다

- **WHEN** 승인된 event에 자유 형식 property, 민감 정보 또는 다른 event의 property가 전달된다
- **THEN** 허용 목록 밖의 값은 device를 떠나기 전에 제거되고 허용된 payload만 전송된다

#### Scenario: 승인되지 않은 event가 전달된다

- **WHEN** caller가 현재 taxonomy에 없는 event name을 전달한다
- **THEN** adapter는 event를 전송하지 않고 제품 흐름을 그대로 완료한다

### Requirement: 정규화된 route pageview

**Authority / Provenance:** `PROD-819` — Kosmo Web은 Expo Router의 현재 route가 안정적인 route template 기준으로 달라질 때마다 `$pageview`를 정확히 한 번 capture해야 한다(MUST). route group, query·fragment와 동적 segment의 실제 값은 pageview 식별자에 포함하지 않아야 하며(MUST), 같은 route template 안의 re-render·Session 변화·query 변경은 추가 pageview를 만들지 않아야 한다(MUST).

#### Scenario: 최초 Web route가 준비된다

- **WHEN** 앱 시작 후 현재 Expo Router route template이 확인된다
- **THEN** 해당 template의 `$pageview`가 한 번 전송된다

#### Scenario: 다른 route template으로 이동한다

- **WHEN** navigation 결과 현재 route template이 이전 template과 달라진다
- **THEN** 새 template의 `$pageview`가 한 번만 전송된다

#### Scenario: 같은 route의 동적 값이나 query만 달라진다

- **WHEN** route file template은 같고 동적 segment의 실제 값, query 또는 fragment만 달라진다
- **THEN** 실제 값은 payload에 포함되지 않고 중복 `$pageview`도 전송되지 않는다

### Requirement: Account identity 수명주기

**Authority / Provenance:** `PROD-819`, `PROD-469` — Kosmo Web은 확인된 로그인 Session의 opaque Account ID만 PostHog distinct identity로 사용해야 한다(MUST). email·이름·handle 또는 Profile 속성을 identity trait로 보내지 않아야 하며(MUST), 같은 Account는 중복 identify하지 않고 Account 전환과 로그아웃에서 이전 identity를 reset해야 한다(MUST).

#### Scenario: guest가 로그인한다

- **WHEN** guest 상태에서 Account ID가 있는 유효 Session이 확인된다
- **THEN** PostHog는 opaque Account ID로 한 번 identify되고 별도 identity trait는 전송되지 않는다

#### Scenario: 같은 Account Session이 다시 렌더된다

- **WHEN** 이미 identify된 Account ID와 같은 Session 상태가 다시 관찰된다
- **THEN** identify 또는 reset이 중복 실행되지 않는다

#### Scenario: 다른 Account로 전환한다

- **WHEN** 현재 identify된 Account ID와 다른 유효 Account Session이 확인된다
- **THEN** 이전 identity를 reset한 뒤 새 opaque Account ID를 identify한다

#### Scenario: 로그아웃하거나 guest 상태가 된다

- **WHEN** 로그인 Session이 성공적으로 종료되거나 유효한 Account가 없는 상태로 전환된다
- **THEN** 이전 PostHog identity를 한 번 reset하고 이후 event는 그 Account에 연결되지 않는다

### Requirement: 분석 장애 격리

**Authority / Provenance:** `PROD-819`, `PROD-795` — PostHog 초기화, capture, identify, reset 또는 network 전송의 동기·비동기 실패는 Kosmo의 렌더링, navigation, 인증, mutation 결과와 기존 사용자 오류 처리를 실패시키거나 지연시키지 않아야 한다(MUST).

#### Scenario: SDK 초기화가 실패한다

- **WHEN** PostHog client 생성이 throw하거나 사용할 수 없는 상태가 된다
- **THEN** analytics는 no-op으로 수렴하고 앱은 분석 설정이 없는 경우와 동일하게 동작한다

#### Scenario: 전송 또는 identity 작업이 실패한다

- **WHEN** capture, identify, reset 또는 network 전송이 throw하거나 reject된다
- **THEN** 원래 사용자 흐름은 성공·실패 결과를 analytics와 무관하게 그대로 완료한다

### Requirement: Native no-op 경계

**Authority / Provenance:** `docs/design/breakpoints.md`, `PROD-819`, `PROD-537` — Android·iOS는 공용 analytics interface를 계속 제공하되 이번 Web slice의 PostHog 호출을 명시적 no-op으로 처리해야 한다(MUST). Native build graph와 bundle은 `posthog-js` 또는 `posthog-react-native` runtime을 포함하지 않아야 하며(MUST), 이 결과를 Native 분석 지원 완료 또는 영구 비지원 결정으로 해석하지 않아야 한다(MUST).

#### Scenario: 공용 analytics API를 Native에서 호출한다

- **WHEN** Android 또는 iOS runtime이 initialize, capture, identify 또는 reset API를 호출한다
- **THEN** network 전송과 identity 변화 없이 제품 동작이 계속된다

#### Scenario: Native bundle을 생성한다

- **WHEN** Android 또는 iOS bundle dependency graph를 검사한다
- **THEN** PostHog Web·Native SDK runtime이 포함되지 않는다
