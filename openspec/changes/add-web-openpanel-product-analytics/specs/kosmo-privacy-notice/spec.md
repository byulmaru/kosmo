## ADDED Requirements

### Requirement: 공개 Kosmo 개인정보 처리방침

Kosmo MUST 인증 없이 접근할 수 있는 개인정보 처리방침을 제공하고 landing과 인증 후 menu에서 연결해야 한다. 처리방침은 실제 처리 목적·항목·법적 근거·보유와 파기·제공과 위탁·국외 이전·권리 행사·행태정보·안전조치·책임자·구제·변경 이력을 구체적으로 밝혀야 한다.

**Authority / Provenance:** `PROD-469`, 개인정보보호위원회 「개인정보 처리방침 작성지침」 2026.4 개정

#### Scenario: 방문자가 처리방침을 연다

- **WHEN** 방문자가 `/privacy`에 접근한다
- **THEN** 로그인 없이 현재 시행일과 모든 필수 처리 항목을 읽을 수 있다

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
