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

#### Scenario: 조회 불가능한 조상 경계

- **WHEN** API가 조회 불가능한 Parent 또는 중간 조상에서 경로를 중단한다
- **THEN** 클라이언트는 API가 제공한 경계까지만 thread를 표시한다
- **AND** 숨겨진 Post를 우회 노출하거나 thread 관계를 평탄화하지 않는다

#### Scenario: thread Post 상세 이동

- **WHEN** 사용자가 thread에 표시된 조회 가능한 Post를 선택한다
- **THEN** 클라이언트는 해당 Post 상세로 이동한다
