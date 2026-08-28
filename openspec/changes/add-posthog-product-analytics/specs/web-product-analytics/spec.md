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

**Authority / Provenance:** `PROD-819`, `PROD-820`, PR #653/#685 review — Kosmo Web은 `defaults: '2026-05-30'`을 사용하고 PostHog 표준 pageview·pageleave·autocapture, URL/referrer/session metadata, persistence와 remote config를 유지해야 한다(MUST). 앱 코드가 manual pageview, route normalizer, runtime event allowlist, property denylist 또는 `before_send` sanitizer로 이 동작을 대체하거나 차단하지 않아야 한다(MUST NOT).

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

#### Scenario: Cloud remote config가 필요하다

- **WHEN** feature flag, autocapture, performance, heatmap, console 또는 Session Replay 설정을 조회한다
- **THEN** SDK의 remote config와 필요한 external dependency loading이 차단되지 않는다

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

**Authority / Provenance:** `PROD-819`, `PROD-469` — Kosmo Web은 확인된 로그인 Session의 opaque Account ID만 PostHog distinct identity로 사용해야 한다(MUST). email·이름·handle 또는 Profile 속성을 identity trait로 보내지 않아야 하며(MUST), SDK의 persisted identified state를 기준으로 Account 전환과 guest reset을 판정해야 한다(MUST).

#### Scenario: guest가 로그인한다

- **WHEN** SDK가 anonymous이고 유효한 Account ID가 확인된다
- **THEN** PostHog는 opaque Account ID로 identify되고 별도 trait는 전송되지 않는다

#### Scenario: 같은 Account Session이 다시 관찰된다

- **WHEN** SDK가 같은 Account ID로 이미 identified된 상태다
- **THEN** reset하지 않고 같은 ID 처리와 retry를 PostHog SDK에 맡긴다

#### Scenario: 다른 Account로 전환한다

- **WHEN** SDK의 persisted identified Account와 다른 유효 Account가 확인된다
- **THEN** 이전 identity를 reset한 뒤 새 opaque Account ID를 identify한다

#### Scenario: reload 뒤 guest가 된다

- **WHEN** module state는 비어 있어도 SDK persistence에는 identified Account가 남아 있고 유효한 Account Session이 없다
- **THEN** 이전 PostHog identity를 reset하고 이후 event가 그 Account에 연결되지 않게 한다

### Requirement: Session Replay Cloud privacy controls

**Authority / Provenance:** `PROD-820`, `PROD-741`, `PROD-795`, `PROD-575` — production Web SDK 배포 전에 `Kosmo Production`은 Session Replay 10% sampling, production canonical origin 제한, input·textarea와 canonical Post Content masking, 30일 retention을 적용해야 한다(MUST). PROD-741은 이 설정을 처음 활성화하지 않고 실제 replay 품질·masking·fail-open을 acceptance 해야 한다(MUST).

#### Scenario: production Session Replay 설정을 조회한다

- **WHEN** `Kosmo Production`의 Web recording 조건을 확인한다
- **THEN** sampling은 10%이고 URL 조건은 production canonical origin만 허용한다
- **AND** retention은 30일이다

#### Scenario: 사용자가 입력하거나 Post Content를 본다

- **WHEN** recording 대상 session에 input·textarea 값 또는 canonical Post Content가 렌더된다
- **THEN** input은 Cloud privacy mode로 mask되고 Post Content root는 PostHog 표준 `ph-mask` marker를 제공한다

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
