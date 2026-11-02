## ADDED Requirements

### Requirement: 작성자 프로필의 표시 경계와 위쪽 여백

게시글 작성자 프로필 텍스트 영역은 닉네임·핸들 중 더 넓게 표시된 텍스트까지를 공통 오른쪽 경계로 사용해야 한다(SHALL). 그 묶음 안의 짧은 줄 오른쪽 여백과 프로필 영역에 대응하는 바로 위 여백도 같은 작성자의 프로필로 한 번 이동해야 한다(SHALL).

**Source Context:** PROD-1176의 2026-10-20 사용자 결정과 완료 기준.

#### Scenario: 닉네임이 더 넓은 경우

- **WHEN** 닉네임이 핸들보다 넓게 표시되고 핸들 줄에서 닉네임의 오른쪽 경계 안쪽 여백을 누른다.
- **THEN** 해당 작성자의 프로필로 한 번 이동한다.
- **AND** 게시글 상세 이동은 함께 발생하지 않는다.

#### Scenario: 핸들이 더 넓은 경우

- **WHEN** 핸들이 닉네임보다 넓게 표시되고, 두 줄의 공통 경계 안쪽을 누른다.
- **THEN** 해당 작성자의 프로필로 한 번 이동한다.

#### Scenario: 작성자 바로 위 여백

- **WHEN** 작성자 프로필 영역에 대응하는 바로 위의 기존 비상호작용 여백을 누른다.
- **THEN** 해당 작성자의 프로필로 한 번 이동한다.

#### Scenario: 좁은 화면에서 텍스트가 잘림

- **WHEN** 화면 폭이나 font 확대 때문에 닉네임 또는 핸들이 잘리고 표시된 프로필 경계 안팎을 누른다.
- **THEN** 경계 안은 프로필로, 그 오른쪽의 남는 헤더 여백은 해당 게시글 상세로 한 번 이동한다.
- **AND** 숨겨진 원래 텍스트 길이 때문에 프로필 링크가 남는 가로 여백까지 차지하지 않는다.

### Requirement: 오른쪽 여백의 게시글 대상

프로필 경계 오른쪽의 남는 헤더 여백은 표시 중인 작성자 행에 대응하는 기존 게시글 상세 대상으로 한 번 이동해야 한다(SHALL). 일반 Post·Quote·순수 Repost의 기존 Profile·Post identity를 유지해야 한다(SHALL).

**Source Context:** PROD-1176, `docs/domain/objects/post.md`의 Post 상세, accepted ADR 0027,
`docs/design/post-action-bar.md`의 Surface 배치·Source가 Quote인 순수 Repost.

#### Scenario: 일반 게시글과 타래 목록 행

- **WHEN** 일반 Post 또는 타래의 조상·하위 목록 행에서 프로필 경계 오른쪽 여백을 누른다.
- **THEN** 그 행의 기존 게시글 상세로 한 번 이동한다.
- **AND** 타래의 현재 게시글 ID로 대체하지 않는다.

#### Scenario: Quote의 바깥 작성자와 직접 Source

- **WHEN** Quote 바깥 작성자 행 또는 직접 Source 작성자 행에서 프로필 경계 오른쪽 여백을 누른다.
- **THEN** 바깥 행은 Quote 자체, Source 행은 그 직접 Source의 상세로 한 번 이동한다.
- **AND** 각 프로필 영역은 각 행에 표시한 작성자의 프로필로 이동한다.

#### Scenario: 순수 Repost와 Source가 Quote인 조합

- **WHEN** 순수 Repost의 주된 작성자 행에서 경계 오른쪽 여백을 누른다.
- **THEN** 직접 Source의 상세로 한 번 이동하며, Source가 Quote이면 그 Quote 자체가 대상이다.
- **AND** 재게시자 attribution과 한 단계 Source preview의 기존 독립 목적지는 유지한다.

### Requirement: 기존 독립 입력과 비대화형 표시 보존

프로필 아래 배경·본문·작성 시각·링크·버튼은 각각의 기존 동작을 유지해야 한다(SHALL). 경계 변경으로 프로필과 게시글 상세가 함께 열리거나 독립 액션에 이동이 덧붙어서는 안 된다(MUST NOT).

**Source Context:** PROD-1176의 기존 동작 유지·중복 이동 방지 기준, `docs/design/post-action-bar.md`,
`docs/design/post-thread.md`, `docs/design/accessibility.md`.

#### Scenario: 기존 링크와 컨트롤 입력

- **WHEN** Avatar·시간·본문 링크·Mention·Media·CW·반응 또는 Action Bar를 활성화한다.
- **THEN** 해당 입력의 기존 동작만 실행하고 프로필·상세 이동을 중복으로 실행하지 않는다.

#### Scenario: 스크롤과 취소

- **WHEN** 탭 대신 세로 스크롤·drag·취소 또는 영역 밖 release가 발생한다.
- **THEN** 기존 입력 취소 규칙을 유지하며 새 프로필·상세 이동을 시작하지 않는다.

#### Scenario: 비대화형 preview

- **WHEN** 같은 작성자 표시를 비대화형 preview에서 렌더링한다.
- **THEN** 경계 변경으로 새 프로필·상세 이동을 활성화하지 않는다.
