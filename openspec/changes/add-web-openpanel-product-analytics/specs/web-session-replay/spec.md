## ADDED Requirements

### Requirement: Web session replay 샘플링

Client ID가 있는 Kosmo Web은 OpenPanel session replay를 10% sample rate로 MUST 활성화해야 한다.

**Authority / Provenance:** `PROD-469`

#### Scenario: replay 표본에 포함된다

- **WHEN** production 사용 세션이 SDK의 10% replay 표본에 포함된다
- **THEN** 화면 전환, 클릭, 스크롤과 렌더링 상태가 OpenPanel replay로 전송된다

### Requirement: 입력과 Post Content 마스킹

Session replay는 모든 input·textarea 값을 마스킹하고 모든 canonical Post Content renderer의 텍스트를 MUST 마스킹해야 한다. 표시명·handle과 Post Content 밖의 렌더링 텍스트는 마스킹 대상이 아니다.

**Authority / Provenance:** `PROD-469`

#### Scenario: 사용자가 값을 입력한다

- **WHEN** 사용자가 검색, Post 작성 또는 Profile 입력 surface에 값을 입력한다
- **THEN** replay에는 실제 입력값이 포함되지 않는다

#### Scenario: Post Content가 렌더링된다

- **WHEN** plain text 또는 structured document Post Content가 목록·상세·답글·인용 source에 렌더링된다
- **THEN** canonical renderer의 본문 텍스트는 replay에서 마스킹된다
