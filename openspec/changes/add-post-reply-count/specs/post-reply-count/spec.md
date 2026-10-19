## ADDED Requirements

### Requirement: 현재 viewer가 조회 가능한 직접 Reply 수

시스템은 해당 Post를 Reply Parent로 직접 참조하는 Reply 중 현재 viewer가 조회할 수 있는 수만 집계해야 한다(MUST). 손자 이후의 Reply와 조회 불가 Reply의 존재를 수치에 포함해서는 안 된다(MUST NOT).

**Source Context:** `docs/domain/objects/post.md`의 Reply 수·Post Visibility·Post Eligibility,
Accepted ADR 0014, Linear PROD-1152와 2026-10-19 현재 사용자 합의.

#### Scenario: 직접 Reply와 손자 Reply 구분

- **WHEN** 조회 가능한 A → B → C의 Reply 관계가 있고 다른 Reply는 없다
- **THEN** A와 B의 Reply 수는 각각 1이고 C는 0이다

#### Scenario: viewer에 따라 다른 수치

- **WHEN** Parent의 직접 Reply 중 Public·Followers Only·Mentioned Profiles Reply가 섞여 있다
- **THEN** guest·작성자·팔로워·멘션 수신자·무관한 Profile의 수치는 각 Reply의 기존 조회 정책을 따른다
- **AND** 조회 불가 Reply를 추가하거나 제거해도 해당 viewer의 수치는 변하지 않는다

#### Scenario: Reply 자체의 자격과 조회 방향

- **WHEN** 직접 Reply가 Tombstone이거나 Author·Instance·Media가 기존 조회 정책을 통과하지 못한다
- **THEN** 해당 Reply는 수치에 포함되지 않는다
- **AND** Profile Block 방향과 Profile Domain Block은 canonical 조회 정책을 따르고 목록 전용 필터로 직접 조회 권한을 대체하지 않는다

#### Scenario: Reply와 Quote의 관계 독립

- **WHEN** 직접 Reply가 Quote이기도 하고 다른 Post는 Parent를 Source로 인용만 했다
- **THEN** Reply+Quote만 Parent의 Reply 수에 포함하고 순수 Quote는 포함하지 않는다
- **AND** Quote의 Reply 수는 Quote 자신의 직접 Reply 관계를 기준으로 한다

#### Scenario: 저장된 Remote 관계의 한계

- **WHEN** Local Reply와 Parent가 연결된 Remote Reply, Parent가 미해석된 Remote Post가 있다
- **THEN** 조회 가능한 앞의 두 Reply만 집계하며 미수신·미연결 원격 답글의 전체 수를 추정하지 않는다

#### Scenario: 페이지네이션과 독립된 수치

- **WHEN** 직접 Reply가 21개이고 현재 스레드 페이지에는 그중 20개만 불러온 상태다
- **THEN** 수치는 21이며 다음 페이지 로딩이나 손자 Reply 추가로 바뀌지 않는다

### Requirement: 공용 Action Bar의 Reply 수 표시

시스템은 Home·Local·Profile·Bookmarks 목록, Post 상세/스레드와 Media Viewer의 Reply control에 같은 의미의 수치를 표시해야 한다(MUST). 1 이상이면 기존 compact 표시를 사용하고, 0이면 숫자를 생략해야 한다(MUST).

**Source Context:** `docs/design/post-action-bar.md`의 Reply count, Linear PROD-1152와 현재 사용자 합의.

#### Scenario: 같은 Post의 화면별 표시

- **WHEN** 같은 viewer와 서버 수치로 목록·상세/스레드·Media Viewer를 렌더링한다
- **THEN** 각 Reply control에 같은 의미의 수치가 표시되고 기존 glyph·간격·target·expanded·인증 위임을 유지한다
- **AND** 표시 수치를 보조 기술로도 확인할 수 있으며 숫자 전용 클릭 동작은 추가하지 않는다

#### Scenario: 0과 큰 숫자

- **WHEN** 확정된 수치가 0 또는 큰 양의 정수다
- **THEN** 0은 아이콘만 표시하고 양수는 기존 locale 기반 `Intl.NumberFormat` compact notation으로 표시한다

#### Scenario: 조회 실패와 미제공

- **WHEN** 수치 조회가 실패하거나 제공되지 않는다
- **THEN** 실패·미제공을 0으로 대신하지 않고 기존 조회 오류 경계를 따른다

#### Scenario: pure Repost와 Quote의 identity

- **WHEN** pure Repost 또는 Quote의 Action Bar를 표시한다
- **THEN** pure Repost의 바깥 Reply는 기존 disabled를 유지하고 Source의 Reply 수를 대신 표시하지 않는다
- **AND** Quote는 자신의 Reply 수를 표시한다

### Requirement: 작성·삭제 뒤 서버 확정 수치와 actor 경계

시스템은 본인 Reply 작성·삭제 성공 뒤 해당 직접 Parent의 서버 확정 수치를 요청 actor에 반영해야 한다(MUST). 실패한 변경에 추측한 증감을 적용하거나 이전 actor의 늦은 응답으로 새 actor의 수치를 바꿔서는 안 된다(MUST NOT).

**Source Context:** `docs/domain/objects/post.md`의 Reply 수, Linear PROD-1152와 기존 actor Environment 계약.

#### Scenario: 작성·삭제 성공

- **WHEN** 본인 Reply 작성 또는 삭제가 성공하고 직접 Parent를 조회할 수 있다
- **THEN** 현재 표시 중인 해당 Parent의 수치는 서버에서 확정한 결과로 갱신된다
- **AND** 손자 Reply의 작성·삭제는 원글 수치를 바꾸지 않는다

#### Scenario: 실패와 선택적 수치 조회

- **WHEN** 변경이 성립하지 않거나 변경 성공 후 선택적 수치 조회가 실패한다
- **THEN** 확인하지 못한 결과를 임의의 증감이나 0으로 대신하지 않는다
- **AND** 수치 조회 실패를 이유로 이미 성공한 작성·삭제를 다시 실행하지 않는다

#### Scenario: actor 전환과 늦은 응답

- **WHEN** actor A의 요청 중 actor B로 전환하고 A의 응답이 늦게 도착한다
- **THEN** B의 수치·UI는 B의 조회 범위를 유지하며 A의 늦은 수치를 섞지 않는다

### Requirement: 다른 사용자·원격 변경의 재조회 반영

시스템은 다른 사용자·원격 수신에 따른 변경을 해당 데이터 재조회 시 반영해야 한다(MUST). 이번 기능은 실시간 구독을 요구하지 않는다.

**Source Context:** `docs/domain/objects/post.md`의 Reply 수, Linear PROD-1152와 현재 사용자 합의.

#### Scenario: 재조회로 수치 반영

- **WHEN** 다른 사용자 또는 원격 Reply가 추가·삭제된 뒤 해당 Post 데이터를 다시 조회한다
- **THEN** 현재 viewer가 조회 가능한 직접 Reply의 최신 수치를 표시한다
