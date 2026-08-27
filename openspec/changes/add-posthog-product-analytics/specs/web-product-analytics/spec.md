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

**Authority / Provenance:** `PROD-819`, `PROD-795` — 초기 PostHog 기반 단계에서 Kosmo Web은 PostHog SDK의 `capture_pageview: 'history_change'` pageview와 app-owned adapter가 명시적으로 보내는 승인된 제품 이벤트만 수집해야 한다(MUST). automatic pageleave, broad element autocapture, session replay, console, Web Vitals, performance와 heatmap 수집은 이 초기 단계에서 비활성화해야 하며(MUST), 후속 PROD-741 계약·activation gate 없이 활성화하지 않아야 한다(MUST).

#### Scenario: Web client가 초기화된다

- **WHEN** 유효한 공개 PostHog 설정으로 Web client가 생성된다
- **THEN** SDK history-change pageview는 활성화되고 pageleave·element autocapture·session replay·기타 승인되지 않은 자동 수집은 비활성화되며 app-owned adapter의 명시적 capture도 전송 후보가 된다

#### Scenario: 초기 replay-off 단계에서 사용자 입력이나 DOM 상호작용이 발생한다

- **WHEN** PROD-819·PROD-795 초기 단계에서 명시적 analytics caller가 없는 입력, click, form 변화 또는 console 출력이 발생한다
- **THEN** PostHog 이벤트, replay 또는 성능 payload가 생성되지 않는다

### Requirement: phased Web Session Replay activation and masking

**Authority / Provenance:** `PROD-820`, `PROD-741` — 최신 Linear 사용자 승인 계약에 따라 초기 PostHog 기반 단계와 후속 replay 활성화 단계를 구분해야 한다(MUST). PostHog 공식 Session Replay 문서는 provider behavior reference로만 사용한다.

#### Scenario: 초기 PostHog 기반 단계에서는 replay가 꺼져 있다

- **WHEN** PROD-819·PROD-795 초기 단계의 local, non-production 또는 production-equivalent Web build가 실행된다
- **THEN** Web Session Replay recording은 생성되지 않고, replay 수집 설정은 비활성화되어야 한다

#### Scenario: 후속 단계의 production canonical origin replay 설정은 10%이다

- **WHEN** PROD-795 gate 이후 PROD-741 activation 설정과 production canonical origin을 확인한다
- **THEN** Web Session Replay sample 설정값이 10%임을 확인하고, 다른 origin·환경에는 replay를 활성화하지 않는다. observed recording 비율을 작은 표본으로 추정해 설정값을 대신하지 않는다

#### Scenario: 설정된 replay sample을 별도로 재생한다

- **WHEN** 10% 설정이 확인된 production canonical origin에서 sample replay recording을 선택한다
- **THEN** 선택한 표본 recording을 재생해 실제 replay 동작과 redaction을 확인하며, 표본 관찰 결과를 10% 설정값의 통계적 증명으로 해석하지 않는다

#### Scenario: replay 활성화 전에 canonical 콘텐츠를 마스킹한다

- **WHEN** replay가 활성화된 production canonical origin에서 사용자가 `input`·`textarea`에 값을 입력하거나 canonical Post Content renderer의 본문을 표시한다
- **THEN** 모든 해당 값과 본문 텍스트는 replay에서 마스킹되고 원문은 recording에 포함되지 않는다

#### Scenario: 추가 custom selector는 현재 masking 완료 조건이 아니다

- **WHEN** PROD-741의 replay activation·masking 검증 결과를 판정한다
- **THEN** 모든 `input`·`textarea` 값과 canonical Post Content renderer 본문 마스킹만 현재 필수 완료 조건으로 판단하고, 그 밖의 custom selector 정책은 이 change의 완료 조건으로 요구하지 않는다

### Requirement: Session Replay retention policy

**Authority / Provenance:** `PROD-820`, `PROD-741` — 초기 보존 기간과 변경·증거 기록은 최신 Linear 사용자 승인 제품 계약이며 반드시 준수해야 한다(MUST). PostHog 공식 Session Replay retention 문서는 플랜별 지원 범위와 설정 적용 시점에 관한 provider behavior reference로만 사용한다.

#### Scenario: activation 시 초기 보존 기간은 30일이다

- **WHEN** PROD-741 activation gate에서 Session Replay 설정과 증거를 확인한다
- **THEN** 초기 보존 기간은 30일이고, 실제 설정값·적용 시점·적용 플랜이 기록되어야 한다

#### Scenario: 지원 범위 안에서 보존 기간을 변경한다

- **WHEN** 운영자가 현재 PostHog 플랜이 지원하는 범위 안에서 Session Replay 보존 기간을 변경한다
- **THEN** 실제 변경 후 보존 기간 값, 적용 시점, 변경 근거와 당시 적용 플랜 또는 지원 범위 근거를 모두 기록하고, 변경 이후 수집되는 replay부터 새 기간을 적용한다

#### Scenario: 더 긴 보존 범위를 지원하는 plan upgrade가 자동 연장하지 않는다

- **WHEN** 더 긴 Session Replay 보존 범위를 지원하는 PostHog plan upgrade가 발생하지만 retention 운영 설정을 별도로 변경하지 않는다
- **THEN** 제품 보존 기간은 자동으로 연장되지 않고 기존 설정값을 유지하며, 변경하려면 실제 변경값·적용 시점·변경 근거·당시 플랜 또는 지원 범위 근거를 명시적으로 기록해야 한다

#### Scenario: 기존 replay와 새 replay의 적용 범위를 구분한다

- **WHEN** Session Replay 보존 기간을 변경한 뒤 기존 recording과 변경 이후 recording을 각각 확인한다
- **THEN** 새 기간은 설정 이후 수집된 replay에만 적용되고, 기존 recording의 원래 보존 정책은 자동으로 재작성되지 않는다

### Requirement: event별 TypeScript 계약과 SDK metadata 경계

**Authority / Provenance:** `PROD-819`, `PROD-469`, `PROD-575` — Kosmo Web 공용 analytics API는 기존 내부 caller의 event별 property를 discriminated TypeScript 계약으로 제한해야 하며(MUST), typed properties는 PostHog capture에 그대로 전달해야 한다(MUST). 별도 runtime allowlist·projection·value validator·unknown-event drop schema를 두지 않아야 하며(MUST), app caller는 email·이름·handle·검색 원문·Post Content·오류 원문·URL query·fragment와 credential·token 성격의 값을 전달하지 않아야 한다(MUST).

- `$pageview`: SDK가 생성하며 표준 `$pathname`은 유지
- `profile_created`, `profile_selected`: `selected_profile_id`
- `post_created`: `selected_profile_id`, `visibility`
- `follow_succeeded`: `selected_profile_id`, `result`
- `search_submitted`: `tab`, `source`
- `search_results_loaded`: `tab`, `has_results`
- `search_result_selected`: `tab`

#### Scenario: 승인된 event와 property가 전달된다

- **WHEN** caller가 event별 TypeScript 계약에 맞는 property를 전달한다
- **THEN** adapter는 event name과 typed properties를 변형하지 않고 SDK protocol/session metadata와 함께 capture한다

#### Scenario: event 계약에 맞지 않는 호출을 작성한다

- **WHEN** caller가 unknown event, 누락된 필수 property 또는 잘못된 value type의 호출을 작성한다
- **THEN** discriminated TypeScript 계약의 컴파일 검증은 해당 호출을 거부한다

#### Scenario: typed event properties를 SDK에 전달한다

- **WHEN** event별 typed caller가 adapter를 호출한다
- **THEN** adapter는 event name과 typed properties를 runtime에서 재투영하거나 drop하지 않고 SDK capture에 전달한다

#### Scenario: SDK URL metadata를 최종 필터링한다

- **WHEN** PostHog SDK가 event에 current URL·query·hash·referrer 등 URL metadata를 추가한다
- **THEN** `before_send`는 불필요한 SDK URL metadata만 제거하고 SDK pageview의 `$pathname`, app-owned typed properties와 SDK protocol/session metadata는 유지한다

### Requirement: SDK history-change pageview

**Authority / Provenance:** `PROD-819`, `PROD-575` — Kosmo Web은 PostHog SDK의 `capture_pageview: 'history_change'`를 사용해 browser history change에 따른 `$pageview`를 자동 수집해야 한다(MUST). SDK pageview의 표준 `$pathname`은 유지해야 하며(MUST), current URL·query·hash·referrer 등 불필요한 URL metadata는 제한해야 한다(MUST).

#### Scenario: Web client가 history-change pageview를 사용한다

- **WHEN** 유효한 공개 설정으로 Web client가 초기화된다
- **THEN** `capture_pageview: 'history_change'`가 설정되고 SDK가 생성한 `$pageview`의 표준 `$pathname`이 유지된다

#### Scenario: browser history가 변경된다

- **WHEN** Web navigation이 browser history를 변경한다
- **THEN** SDK가 history-change pageview를 생성하고 SDK URL metadata 필터를 적용한다

#### Scenario: SDK pageview URL metadata가 함께 생성된다

- **WHEN** SDK pageview에 current URL·query·hash·referrer 등 URL metadata가 함께 생성된다
- **THEN** `$pathname`은 유지되고 불필요한 URL metadata만 `before_send`에서 제한된다

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
