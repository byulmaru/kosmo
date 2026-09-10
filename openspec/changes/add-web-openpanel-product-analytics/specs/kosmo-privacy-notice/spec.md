## ADDED Requirements

### Requirement: 공개 Kosmo 개인정보 처리방침

Kosmo MUST 인증 없이 접근할 수 있는 개인정보 처리방침을 제공하고 landing과 기존 인증 후 full Web right rail에서 연결해야 한다. 인증 후 full Web Sidebar, compact Web icon rail과 mobile Web·Android/iOS drawer에는 개인정보 처리방침 진입점을 추가해서는 안 된다(MUST NOT). 대신 인증된 모든 플랫폼에서 Settings의 `정보` detail(`/settings/info`)을 통해 공개 `/privacy`로 추가 진입할 수 있어야 한다. 처리방침은 실제 처리 목적·항목·법적 근거·보유와 파기·제공과 위탁·국외 이전·권리 행사·행태정보·안전조치·책임자·구제·변경 이력을 구체적으로 밝혀야 한다.

**Authority / Provenance:** `PROD-469`, `PROD-889`, `docs/design/settings.md`, `docs/design/breakpoints.md`, 개인정보보호위원회 「개인정보 처리방침 작성지침」 2026.4 개정

#### Scenario: 방문자가 처리방침을 연다

- **WHEN** 방문자가 `/privacy`에 접근한다
- **THEN** 로그인 없이 현재 시행일과 모든 필수 처리 항목을 읽을 수 있다

#### Scenario: 인증 사용자가 full Web shell에서 처리방침을 연다

- **WHEN** 인증된 사용자가 full Web right rail 최하단의 `개인정보 처리방침` link를 활성화한다
- **THEN** 시스템은 공개 `/privacy` route로 이동한다
- **AND** link는 accessible name과 Web 최소 target 크기를 제공한다

#### Scenario: 전역 navigation에서 처리방침 진입점을 추가하지 않는다

- **WHEN** 인증된 사용자가 full Web Sidebar, compact Web icon rail 또는 mobile Web·Android/iOS drawer를 연다
- **THEN** 시스템은 개인정보 처리방침 link나 같은 의미의 진입 control을 시각·접근성 트리에 노출하지 않는다
- **AND** 공개 `/privacy` route, landing link와 기존 full Web right rail link는 유지한다

#### Scenario: Settings 정보에서 처리방침을 연다

- **WHEN** 인증된 사용자가 Web 또는 Android/iOS Settings의 `정보` detail(`/settings/info`)에서 `개인정보 처리방침` link를 활성화한다
- **THEN** 시스템은 공개 `/privacy` route로 이동한다
- **AND** link는 accessible name과 해당 플랫폼의 최소 target 크기를 제공한다

### Requirement: OpenPanel 자동 수집과 replay 고지

처리방침은 OpenPanel이 수집하는 URL·query·title·referrer, 외부 링크, 기기·브라우저, 익명 device/session ID, Account·Profile ID, 명시적 행동 이벤트와 session replay 범위·sample rate·마스킹·보유를 실제 설정과 일치하게 MUST 고지해야 한다.

**Authority / Provenance:** `PROD-469`, 개인정보보호위원회 「개인정보 처리방침 작성지침」 2026.4 개정

#### Scenario: 분석 처리 내용을 확인한다

- **WHEN** 정보주체가 자동 수집과 행태정보 섹션을 읽는다
- **THEN** 수집 항목, 목적, 방법, 보유·삭제, 통제와 권리 행사 방법을 확인할 수 있다

### Requirement: 분석 데이터 삭제 운영 절차

운영자는 Account ID에 연결된 OpenPanel 데이터를 삭제 요청에 따라 식별·삭제·검증할 수 있는 안전한 runbook을 MUST 가져야 한다.

**Authority / Provenance:** `PROD-469`

#### Scenario: 계정 연결 데이터 삭제를 요청한다

- **WHEN** 검증된 정보주체의 삭제 요청이 접수된다
- **THEN** 운영자는 삭제 전 범위를 확인하고 해당 Account ID 데이터만 삭제한 뒤 잔존 여부를 검증할 수 있다
