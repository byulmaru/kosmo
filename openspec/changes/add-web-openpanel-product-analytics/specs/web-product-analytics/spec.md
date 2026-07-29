## ADDED Requirements

### Requirement: Client ID 기반 Web 분석 초기화

Kosmo Web은 `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`가 존재할 때만 `https://openpanel.byulmaru.co/api`를 사용하는 OpenPanel client를 MUST 생성해야 한다. Client ID가 없으면 분석은 no-op이어야 하며 별도 environment 또는 enabled flag를 요구하지 않아야 한다.

**Authority / Provenance:** `PROD-469`

#### Scenario: Client ID가 존재한다

- **WHEN** Web bundle에 `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`가 존재한다
- **THEN** OpenPanel client가 자동 화면·외부 링크·`data-track` 수집을 활성화해 생성된다

#### Scenario: Client ID가 없다

- **WHEN** Web bundle에 `EXPO_PUBLIC_OPENPANEL_CLIENT_ID`가 없다
- **THEN** OpenPanel client와 분석 네트워크 전송이 생성되지 않는다

### Requirement: Account identity 생명주기

Kosmo Web은 로그인 전 익명 세션을 허용하고 로그인 Session이 확인되면 opaque Account ID만 OpenPanel identity로 MUST 사용해야 한다. 이메일·이름·handle은 identity trait로 보내지 않아야 하며 성공한 로그아웃 뒤 identity를 초기화해야 한다.

**Authority / Provenance:** `PROD-469`

#### Scenario: 로그인 Session이 확인된다

- **WHEN** 현재 Session과 Account ID가 확인된다
- **THEN** OpenPanel은 Account ID로 identify되고 선택 Profile ID는 identity가 아닌 허용된 이벤트 속성으로만 사용된다

#### Scenario: 로그아웃이 성공한다

- **WHEN** Web 로그아웃 요청과 local actor reset이 성공한다
- **THEN** 이전 Account identity가 clear되어 이후 익명 이벤트에 재사용되지 않는다

### Requirement: 핵심 성공 행동 이벤트

Kosmo Web은 `login_succeeded`, `profile_created`, `profile_selected`, `post_created`, `follow_succeeded`를 해당 사용자 행동이 실제 성공한 뒤 정확히 한 번 MUST 수집해야 한다. 실패 응답과 오류 원문은 성공 이벤트를 만들거나 속성으로 전송하지 않아야 한다.

**Authority / Provenance:** `PROD-469`

#### Scenario: 핵심 mutation이 성공한다

- **WHEN** Profile 생성·선택, Post 생성 또는 Follow mutation이 오류 없이 완료된다
- **THEN** 대응하는 성공 이벤트가 선택 Profile ID와 허용된 enum 속성만 포함해 한 번 전송된다

#### Scenario: 핵심 mutation이 실패한다

- **WHEN** GraphQL 오류 또는 network 오류가 발생한다
- **THEN** 대응하는 성공 이벤트가 전송되지 않고 기존 사용자 오류 처리가 유지된다

### Requirement: 검색 행동 이벤트

Kosmo Web은 검색 제출, 결과 첫 페이지 성공과 결과 Profile 선택을 MUST 추적해야 한다. 명시적 검색 이벤트는 검색 원문과 대상 Profile ID를 속성으로 보내지 않아야 한다.

**Authority / Provenance:** `PROD-469`

#### Scenario: 검색이 실행된다

- **WHEN** 사용자가 직접 입력, 최근 검색 또는 검색 탭 변경으로 비어 있지 않은 검색을 실행한다
- **THEN** `search_submitted`가 `tab`과 `source`만 포함해 전송된다

#### Scenario: 검색 결과가 로드된다

- **WHEN** 검색 결과 첫 페이지가 성공적으로 로드된다
- **THEN** 결과 유무를 나타내는 이벤트가 검색 원문 없이 전송된다

#### Scenario: 검색 결과를 선택한다

- **WHEN** 사용자가 검색 결과 Profile을 선택한다
- **THEN** `search_result_selected`가 tab만 포함해 전송된다

### Requirement: 분석 실패 격리

OpenPanel 초기화, 이벤트 전송 또는 identity 작업의 실패는 Kosmo의 렌더링, navigation, 인증과 mutation 결과를 MUST 실패시키지 않아야 한다.

**Authority / Provenance:** `PROD-469`

#### Scenario: OpenPanel이 차단되거나 실패한다

- **WHEN** 분석 endpoint가 차단되거나 SDK 작업이 실패한다
- **THEN** 원래 사용자 행동과 제품 오류 처리는 분석이 없는 경우와 동일하게 완료된다
