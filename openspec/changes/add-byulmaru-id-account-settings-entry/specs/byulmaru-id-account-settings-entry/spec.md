## ADDED Requirements

### Requirement: Byulmaru ID Account Settings 외부 진입점 표시

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-645` — Kosmo 설정 페이지는 `/settings`의 첫 번째 Account 행에 Byulmaru ID가 소유한 Account Settings 외부 진입점을 제공해야 한다(MUST). 행 label은 Byulmaru ID와 Account 수준 설정임을 전달해야 하고(MUST), accessible name은 Byulmaru ID 외부 서비스로 이동한다는 사실을 전달해야 한다(MUST). 실제 외부 navigation 행에만 chevron을 표시해야 하며(MUST), `계정 설정` heading·소유자 label·설명 block을 별도로 반복해서는 안 된다(MUST NOT).

#### Scenario: 외부 Account 행을 첫 번째로 표시한다

- **WHEN** 인증 사용자가 `/settings`를 연다
- **THEN** 첫 번째 Account 행은 label과 accessible name에서 Byulmaru ID Account Settings 외부 진입점임을 전달한다
- **AND** 행은 다른 위치를 여는 chevron을 표시한다
- **AND** 행 앞뒤에 `계정 설정` heading, 소유자 label 또는 설명 block을 별도로 표시하지 않는다

#### Scenario: Profile control과 이동 의미를 구분한다

- **WHEN** Account 외부 진입점과 Kosmo Profile control이 같은 설정 페이지에 표시된다
- **THEN** Account 행만 외부 navigation을 실행하고 chevron을 표시한다
- **AND** Profile control은 Account 외부 이동을 암시하는 label, accessible name 또는 chevron을 사용하지 않는다

### Requirement: Canonical Byulmaru ID URL과 플랫폼별 외부 navigation

**Authority / Provenance:** `docs/design/settings.md`, `PROD-645` — Account 외부 진입점은 canonical URL `https://id.byulmaru.co`만 열어야 한다(MUST). Web은 정상적인 외부 HTTPS navigation을 사용해야 하고(MUST), Android·iOS는 시스템 브라우저 또는 승인된 external link flow를 사용해야 한다(MUST). Kosmo 내부 Account route, generic placeholder 또는 다른 URL로 이동해서는 안 된다(MUST NOT).

#### Scenario: Web에서 canonical Account Settings를 연다

- **WHEN** Web 사용자가 Account 외부 진입점을 실행한다
- **THEN** 브라우저는 `https://id.byulmaru.co`로 외부 HTTPS navigation한다
- **AND** Kosmo Router의 내부 Account route나 generic placeholder를 열지 않는다

#### Scenario: Android와 iOS에서 canonical Account Settings를 연다

- **WHEN** Android 또는 iOS 사용자가 Account 외부 진입점을 실행하고 환경이 canonical HTTPS URL을 지원한다
- **THEN** 시스템 브라우저 또는 승인된 external link flow가 `https://id.byulmaru.co`를 연다
- **AND** Kosmo 화면을 Account 데이터 화면으로 교체하지 않는다

#### Scenario: Kosmo가 Account 설정 기능을 소유하지 않는다

- **WHEN** Account 외부 진입점을 렌더링하거나 실행한다
- **THEN** Kosmo는 Account 값을 조회하거나 입력·저장 상태를 만들지 않는다
- **AND** 비밀번호·패스키·이메일·계정 삭제 UI를 추가하지 않는다

### Requirement: 외부 이동 실패와 재시도

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-645` — 클라이언트는 canonical URL을 지원하지 않는 환경과 외부 이동 API의 실패를 조용히 무시해서는 안 된다(MUST NOT). 실패한 Account 행 가까이에 backend 또는 platform 오류 원문을 포함하지 않는 안전한 한국어 오류를 표시하고 보조 기술에 알려야 하며(MUST), 사용자가 같은 canonical 외부 이동을 다시 시도할 수 있어야 한다(MUST). 이 오류는 정상인 Profile 설정과 page heading을 숨겨서는 안 된다(MUST NOT).

#### Scenario: 환경이 canonical URL을 지원하지 않는다

- **WHEN** 외부 이동 전 확인에서 환경이 `https://id.byulmaru.co`를 열 수 없다고 응답한다
- **THEN** Account 행 가까이에 안전한 한국어 오류와 재시도 action을 표시한다
- **AND** 외부 이동 API를 실행하거나 실패를 조용히 무시하지 않는다
- **AND** page heading과 정상인 Profile 설정을 계속 표시한다

#### Scenario: 외부 이동 API가 실패한다

- **WHEN** canonical URL의 외부 이동 API가 오류를 반환하거나 거부된다
- **THEN** Account 행 가까이에 안전한 한국어 오류와 재시도 action을 표시하고 오류 상태를 보조 기술에 알린다
- **AND** platform 오류 원문을 사용자에게 그대로 노출하지 않는다

#### Scenario: 실패한 외부 이동을 재시도한다

- **WHEN** 사용자가 Account 외부 이동 오류의 재시도 action을 실행한다
- **THEN** 클라이언트는 `https://id.byulmaru.co` 지원 여부와 외부 이동을 같은 순서로 다시 실행한다
- **AND** 재시도가 성공하면 이전 오류를 제거한다

### Requirement: 외부 진입점 접근성과 입력 방식

**Authority / Provenance:** `docs/design/settings.md`, `docs/design/accessibility.md`, `PROD-645` — Account 외부 진입점은 실제 동작에 맞는 link role, accessible name과 focus-visible 상태를 제공해야 하며(MUST), Web keyboard와 pointer, Android·iOS touch와 screen reader에서 같은 canonical 이동 결과를 제공해야 한다(MUST). Web pointer target은 최소 24×24 CSS px 또는 공식 예외를 충족해야 하고(MUST), iOS는 기본 44×44pt, Android는 48×48dp touch target을 사용해야 한다(MUST).

#### Scenario: Web keyboard로 외부 진입점을 실행한다

- **WHEN** Web keyboard 사용자가 Account 외부 진입점에 focus하고 활성화한다
- **THEN** focus-visible 상태와 Byulmaru ID 외부 이동 accessible name을 확인할 수 있다
- **AND** pointer로 실행할 때와 같은 canonical HTTPS navigation을 수행한다

#### Scenario: screen reader로 외부 진입점과 오류를 이해한다

- **WHEN** screen reader 사용자가 Account 외부 진입점과 실패 상태를 탐색한다
- **THEN** link role과 accessible name에서 Byulmaru ID Account Settings 외부 이동임을 이해할 수 있다
- **AND** 외부 이동 실패와 재시도 action을 중복 없이 이해하고 실행할 수 있다

#### Scenario: 플랫폼별 interactive target을 유지한다

- **WHEN** Account 외부 진입점을 Web, iOS 또는 Android에서 표시한다
- **THEN** 각 플랫폼의 24×24 CSS px, 44×44pt 또는 48×48dp target 계약을 충족한다
- **AND** text scaling과 reflow에서도 label과 action이 잘리거나 가로 scroll에 의존하지 않는다
