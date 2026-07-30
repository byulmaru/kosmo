## ADDED Requirements

### Requirement: 전용 오류 화면 대상과 예상 오류 경계

**Authority / Provenance:** `docs/design/accessibility.md`, PROD-477, PROD-480 — Android·iOS·Web 앱은 현재 화면 렌더링을 계속할 수 없게 만드는 예상하지 못한 client 오류에 공용 전용 오류 화면을 표시해야 한다(MUST). validation·권한·의도된 GraphQL/domain 오류와 사용자가 현재 화면에서 수정하거나 재시도할 수 있는 네트워크·transport 오류는 새 client Sentry event나 전용 오류 화면으로 승격하지 않고 가장 가까운 기존 inline 또는 route-local 복구 흐름을 유지해야 한다(MUST). 사용자에게 보이는 message 문자열을 파싱해 두 종류를 구분해서는 안 된다(MUST NOT).

#### Scenario: 예상하지 못한 render 오류

- **WHEN** 공용 React 또는 route 경계 아래의 예상하지 못한 render 오류 때문에 현재 화면을 계속 렌더링할 수 없다
- **THEN** 앱은 해당 경계에서 공용 전용 오류 화면을 표시한다
- **AND** 오류를 현재 platform의 client Sentry adapter에 한 번 보고한다

#### Scenario: 예상된 mutation 오류

- **WHEN** validation·권한·의도된 GraphQL/domain 오류가 기존 mutation 결과로 반환된다
- **THEN** 앱은 현재 form·control의 inline 오류와 재시도 흐름을 유지한다
- **AND** 해당 오류 때문에 전용 오류 화면이나 새 client Sentry event를 만들지 않는다

#### Scenario: 재시도 가능한 query 또는 network 오류

- **WHEN** 구조화된 GraphQL 응답 오류나 일시적 network·transport 실패를 현재 화면의 가장 가까운 오류 상태에서 재시도할 수 있다
- **THEN** 앱은 해당 inline 또는 route-local 복구 상태를 유지한다
- **AND** 오류 원문을 새 client Sentry event로 다시 보고하거나 사용자용 오류 추적 ID를 표시하지 않는다

#### Scenario: 서버에서 이미 처리한 오류

- **WHEN** API가 예상된 GraphQL 오류를 반환하거나 unexpected server 오류를 기존 서버 Sentry 경계에서 처리해 `INTERNAL_SERVER_ERROR`로 반환한다
- **THEN** client는 그 응답을 별도의 client render 오류로 중복 보고하지 않는다

### Requirement: 실제 Sentry event ID 연결과 중복 방지

**Authority / Provenance:** PROD-477, PROD-480, PROD-483, PROD-493 — 전용 오류 화면은 현재 오류 발생 건을 Sentry에 보고한 adapter가 반환한 opaque event ID만 사용자용 오류 추적 ID로 표시해야 한다(MUST). 앱은 ID를 생성·변환·추측하거나 이전 오류의 ID를 재사용해서는 안 되며(MUST NOT), 하나의 오류 발생 건을 nested React 경계와 platform runtime 경계에서 중복 보고해서는 안 된다(MUST NOT). Web은 PROD-493의 browser reporter를 재사용하고 Android·iOS는 PROD-483의 native reporter가 제공된 뒤 같은 반환 계약을 사용해야 한다(MUST).

#### Scenario: event ID가 발급된 오류

- **WHEN** 현재 platform의 Sentry adapter가 예상하지 못한 오류 한 건을 보고하고 event ID를 반환한다
- **THEN** 전용 오류 화면은 반환된 값을 변경하지 않은 오류 추적 ID로 표시한다
- **AND** 운영 검증에서 같은 ID의 Sentry event 한 건을 조회할 수 있어야 한다

#### Scenario: nested 경계가 같은 오류를 관찰함

- **WHEN** 내부 route·session 경계가 외부 공용 경계보다 먼저 같은 render 오류를 처리한다
- **THEN** 가장 먼저 오류를 처리한 경계의 공용 reporter만 해당 오류를 한 번 보고한다
- **AND** 외부 경계와 browser 전역 수집은 같은 오류의 두 번째 event ID를 만들지 않는다

#### Scenario: ID를 제공할 수 없음

- **WHEN** Sentry adapter가 구성되지 않았거나 보고 과정이 실패하거나 event ID를 반환하지 않는다
- **THEN** 전용 오류 화면은 추적 ID와 복사 action을 표시하지 않는다
- **AND** 안전한 안내와 모든 복구 action은 계속 동작한다

#### Scenario: native 수집 선행 작업이 완료되지 않음

- **WHEN** Android 또는 iOS에서 PROD-483의 native Sentry adapter가 아직 제공되지 않았다
- **THEN** 앱은 Web event ID나 임의 ID를 대신 표시하지 않는다
- **AND** PROD-485의 event ID 대응 검증은 blocker가 해소될 때까지 완료 처리하지 않는다

### Requirement: 오류 추적 ID 복사와 피드백 경계

**Authority / Provenance:** `docs/design/accessibility.md`, PROD-479, PROD-480, PROD-487 — 오류 추적 ID가 있는 전용 오류 화면은 사용자가 그 값을 system clipboard에 복사할 수 있는 action을 제공해야 한다(MUST). 복사 성공과 실패는 안전한 한국어 상태로 시각적·보조 기술 사용자에게 전달되어야 하고(MUST), clipboard 실패가 오류 화면이나 복구 action을 실패시켜서는 안 된다(MUST NOT). 오류 추적 ID를 `/feedback`의 구조화된 input이나 Slack payload에 자동으로 추가해서는 안 된다(MUST NOT).

#### Scenario: 추적 ID 복사 성공

- **WHEN** 사용자가 오류 추적 ID 복사 action을 실행하고 clipboard 쓰기가 성공한다
- **THEN** system clipboard에는 화면에 표시된 ID와 정확히 같은 값이 저장된다
- **AND** 앱은 중복되지 않는 접근 가능한 복사 완료 상태를 알린다

#### Scenario: 추적 ID 복사 실패

- **WHEN** clipboard 권한·platform API 또는 일시적 runtime 문제로 복사가 실패한다
- **THEN** 앱은 내부 오류나 ID를 추가로 노출하지 않는 안전한 실패 상태를 알린다
- **AND** ID 표시, 다시 시도와 안전한 이동 action을 유지한다

#### Scenario: 피드백으로 수동 전달

- **WHEN** 사용자가 복사한 오류 추적 ID를 지원 요청이나 피드백 본문에 직접 붙여 넣는다
- **THEN** 기존 피드백 본문 계약 안에서 일반 사용자 입력으로 전달할 수 있다
- **AND** 앱은 별도 Sentry ID field, 자동 prefill 또는 Slack payload field를 만들지 않는다

### Requirement: 오류 경계 복구와 안전한 이동

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, PROD-480 — 전용 오류 화면은 오류 경계를 reset한 뒤 원래 소유자의 재조회·재렌더 callback을 정확히 한 번 실행하는 다시 시도 action과, 현재 인증 상태와 관계없이 열 수 있는 canonical public 안전 화면으로 이동하는 action을 제공해야 한다(MUST). reset은 이전 오류의 event ID와 복사 상태를 제거해야 하며(MUST), 복구되지 않고 다시 발생한 오류는 이전 ID를 재사용하지 않는 새 오류 발생 건으로 처리해야 한다(MUST).

#### Scenario: 다시 시도 후 복구

- **WHEN** 사용자가 다시 시도를 실행하고 원래 화면이 정상 렌더링된다
- **THEN** 경계는 기존 오류와 event ID·복사 상태를 reset하고 소유자 callback을 정확히 한 번 실행한다
- **AND** 사용자는 원래 흐름을 계속 사용할 수 있다

#### Scenario: 다시 시도 후 동일 경로가 다시 실패함

- **WHEN** reset 뒤의 재조회·재렌더가 예상하지 못한 오류로 다시 실패한다
- **THEN** 앱은 이를 새 오류 발생 건으로 한 번 보고한다
- **AND** 이전 event ID나 복사 완료 상태를 새 오류 화면에 재사용하지 않는다

#### Scenario: 안전한 화면으로 이동

- **WHEN** 사용자가 전용 오류 화면에서 안전한 이동 action을 실행한다
- **THEN** 앱은 실패한 route를 복귀 대상으로 남기지 않고 canonical public 안전 화면으로 이동한다
- **AND** guest와 인증된 사용자 모두 보호 route redirect loop 없이 목적지를 열 수 있다

### Requirement: 안전하고 접근 가능한 universal 오류 화면

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/colors.md`, `docs/design/typography.md`, `docs/design/breakpoints.md`, PROD-480 — 전용 오류 화면은 Android·iOS·Web이 공유하는 React Native UI로 구현해야 하며(MUST), platform별 차이는 Sentry와 clipboard adapter 같은 platform API 경계로 제한해야 한다(MUST). 화면은 안전한 한국어 안내와 opaque 오류 추적 ID만 표시하고 원래 오류 message, stack trace, 내부 경로, 인증 정보 또는 사용자 작성 콘텐츠를 노출해서는 안 된다(MUST NOT). 색상·typography·spacing·breakpoint와 접근성 target은 적용되는 canonical design token과 platform 기준을 따라야 한다(MUST).

#### Scenario: 민감한 오류가 전용 화면에 도달함

- **WHEN** 포착된 오류의 message나 stack에 내부 경로, credential 또는 사용자 작성 콘텐츠가 포함되어 있다
- **THEN** 화면은 그 값을 렌더링하거나 접근성 label·announcement에 포함하지 않는다
- **AND** 사용자에게는 고정된 안전한 한국어 안내와 발급된 opaque event ID만 제공한다

#### Scenario: Web keyboard와 좁은 viewport

- **WHEN** 사용자가 폭 768px 미만 Web viewport에서 keyboard로 오류 화면을 조작한다
- **THEN** 복사·다시 시도·안전한 이동 action은 논리적인 focus 순서와 보이는 focus 상태로 모두 실행 가능하다
- **AND** 각 독립 target은 적용 가능한 Web 최소 크기와 zoom·reflow를 유지한다

#### Scenario: Native 접근성과 text scaling

- **WHEN** Android 또는 iOS 사용자가 큰 글자와 TalkBack 또는 VoiceOver로 오류 화면을 조작한다
- **THEN** 안내·ID·상태가 잘리지 않고 읽히며 action은 고유한 accessible name을 가진다
- **AND** iOS hit region은 최소 44×44pt, Android touch target은 최소 48×48dp를 유지한다
