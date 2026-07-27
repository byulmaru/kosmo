## ADDED Requirements

### Requirement: Post 상세 Reply thread 통합

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-422` 유니버설 클라이언트는 Post 상세에서 API가 제공한 조회 가능한 조상 경로, 현재 Post와 조회 가능한 하위 Reply를 하나의 thread 맥락으로 연결해야 한다(MUST).

#### Scenario: Reply 상세 thread 표시

- **WHEN** 사용자가 조상과 하위 Reply가 있는 Post 상세를 연다
- **THEN** 클라이언트는 조회 가능한 조상 경로, 현재 Post와 조회 가능한 하위 Reply를 같은 thread 맥락으로 표시한다
- **AND** 각 Post는 기존 단일 Post fragment와 rendering 계약을 사용한다

#### Scenario: Reply이면서 Quote인 Post 표시

- **WHEN** thread에 Reply Parent와 Repost Source를 함께 가진 Post가 포함된다
- **THEN** 클라이언트는 Reply thread 맥락과 Quote의 Content·Repost Source 맥락을 함께 유지한다
- **AND** Repost Source가 조회되면 Reply+Quote의 기존 바깥 Post renderer 아래에 기존 목록 Post renderer를 사용한 테두리 있는 Source sibling을 표시한다
- **AND** Repost Source를 조회할 수 없으면 Reply thread와 Quote의 자체 Content를 유지하고 Source preview만
  표시하지 않는다

#### Scenario: 하위 Reply 다음 page 자동 연결

- **WHEN** 조회 가능한 하위 Reply가 다음 page에 남아 있고 사용자가 thread 끝에서 한 viewport 이내로 스크롤한다
- **THEN** 클라이언트는 다음 20개 Relay page를 자동으로 요청하고 기존 항목 뒤에 API 정렬 순서대로 이어 붙인다
- **AND** Web은 document/window를 scroll owner로 유지하고 internal scroller를 만들지 않으며, Native는 sticky-header `ScrollView`를 유지한다
- **AND** 두 경로는 `contentLength - offset - viewportLength <= viewportLength`인 같은 한-viewport near-end 판정과 요청 중 중복 요청을 막는 guard를 공유한다
- **AND** 같은 page 요청이 진행 중이면 추가 scroll·layout event로 중복 요청하지 않는다

#### Scenario: 짧은 초기 thread 채우기

- **WHEN** 초기 하위 Reply page를 표시한 content가 viewport보다 짧고 다음 page가 남아 있다
- **THEN** 클라이언트는 viewport를 채우거나 다음 page가 없어질 때까지 같은 pagination guard로 page를 이어서 요청한다

#### Scenario: 하위 Reply 다음 page 실패

- **WHEN** 다음 하위 Reply page 요청이 실패한다
- **THEN** 클라이언트는 이미 표시한 thread 항목을 유지한다
- **AND** 실패한 cursor 경계에서 다음 page를 다시 요청할 수 있는 inline retry를 표시한다

#### Scenario: 조회 불가능한 조상 경계

- **WHEN** API가 조회 불가능한 Parent 또는 중간 조상에서 경로를 중단한다
- **THEN** 클라이언트는 API가 제공한 경계까지만 thread를 표시한다
- **AND** 숨겨진 Post를 우회 노출하거나 thread 관계를 평탄화하지 않는다

#### Scenario: thread Post 상세 이동

- **WHEN** 사용자가 thread에 표시된 조회 가능한 Post를 선택한다
- **THEN** 클라이언트는 해당 Post 상세로 이동한다
