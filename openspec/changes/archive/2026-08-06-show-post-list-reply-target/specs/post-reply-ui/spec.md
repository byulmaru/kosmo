## ADDED Requirements

### Requirement: 일반 Post 목록의 Reply 대상 attribution

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/design/post-action-bar.md`, `docs/design/post-thread.md`, `docs/design/accessibility.md`, `PROD-696` 유니버설 클라이언트는 조회 가능한 Reply Parent를 가진 일반 Post 목록의 Content Post 위에 Parent 작성자를 나타내는 Reply attribution을 표시해야 하며(MUST), 상세 thread 또는 Parent를 조회할 수 없는 Reply에 같은 목록용 attribution을 표시해서는 안 된다(MUST NOT).

#### Scenario: 조회 가능한 Reply Parent가 있는 일반 목록 Reply

- **WHEN** 일반 Post 목록이 조회 가능한 Reply Parent를 가진 Content Post를 표시한다
- **THEN** 클라이언트는 Post 행 위에 Parent 작성자의 `{displayName}님에게 답글` 문구를 정확히 한 번 표시한다
- **AND** 기존 Reply action과 같은 Message Circle icon을 Repost attribution의 icon column 위치에 표시한다
- **AND** icon은 장식 요소로 보조 기술에서 숨기고 문구는 일반 텍스트로 인식되게 한다
- **AND** 문구에 Post 또는 Profile navigation과 클릭 동작을 제공하지 않는다

#### Scenario: Reply이면서 Quote인 일반 목록 Post

- **WHEN** 일반 Post 목록이 Content, 조회 가능한 Reply Parent와 조회 가능한 Repost Source를 함께 가진 Post를 표시한다
- **THEN** 클라이언트는 Reply attribution을 자체 Content와 Source preview 위에 정확히 한 번 표시한다
- **AND** 기존 Quote의 Content, Source preview와 Action Bar presentation을 유지한다

#### Scenario: Reply Parent를 조회할 수 없는 Reply

- **WHEN** 현재 Reply는 조회할 수 있지만 Reply Parent가 삭제·비공개 또는 Eligibility 경계로 조회되지 않는다
- **THEN** 클라이언트는 Reply attribution과 대체 문구를 표시하지 않는다
- **AND** 현재 Reply 자체는 기존 목록 presentation으로 계속 표시한다

#### Scenario: Reply가 아닌 목록 Post

- **WHEN** 일반 목록의 Post가 Reply Parent를 가지지 않은 일반 Post 또는 Content 없는 순수 Repost다
- **THEN** 클라이언트는 Reply attribution을 표시하지 않는다
- **AND** 순수 Repost의 기존 attribution, Source presentation과 interaction을 유지한다

#### Scenario: 상세 Reply thread

- **WHEN** Post 상세 thread가 조상, 현재 또는 하위 Reply를 표시한다
- **THEN** 클라이언트는 어느 thread 행에도 일반 목록용 Reply attribution을 표시하지 않는다
- **AND** 기존 connector, 행 순서, row boundary와 Post renderer를 유지한다

#### Scenario: Web과 Native의 공용 표현

- **WHEN** 같은 Reply가 Web 또는 Android·iOS의 일반 Post 목록에 표시된다
- **THEN** 각 플랫폼은 같은 icon·문구·상단 metadata 배치와 비대화형 의미를 유지한다
- **AND** 검증하지 않은 플랫폼의 runtime 접근성이나 시각 완료를 다른 플랫폼 증거로 일반화하지 않는다
