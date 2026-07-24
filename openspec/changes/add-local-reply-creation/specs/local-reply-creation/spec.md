## ADDED Requirements

### Requirement: Local Reply 생성 권한과 Parent 검증

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-424` 시스템은 Active Account의 Member이며 Active/Normal Local Profile인 행동 주체에게만, 행동 주체가 조회할 수 있는 contentful Post를 직접 Parent로 참조하는 Local Reply 생성을 허용해야 한다(MUST).

#### Scenario: 조회 가능한 contentful Parent에 Reply 생성

- **WHEN** 행동 주체가 조회할 수 있는 Active contentful Post의 concrete `Post` global ID와 유효한 `bodyText`, 현재 지원 `visibility`를 제공한다
- **THEN** 시스템은 Content와 해당 Reply Parent를 가지고 Repost Source는 없는 Active Post를 생성한다
- **AND** Reply의 Visibility는 Parent의 Visibility와 독립적으로 입력값을 사용한다

#### Scenario: Quote를 Parent로 하는 일반 Reply

- **WHEN** 행동 주체가 조회할 수 있고 Content와 Repost Source를 가진 Quote를 Parent로 제공한다
- **THEN** 시스템은 Quote를 직접 Reply Parent로 가지고 Repost Source는 없는 일반 Reply를 생성한다
- **AND** 이 작성 경계는 Reply+Quote를 생성하지 않는다

#### Scenario: 없거나 contentless인 Parent

- **WHEN** `replyParentId`가 없는 Post를 가리키거나 Content 없는 Repost를 가리킨다
- **THEN** 시스템은 생성을 거부한다
- **AND** Post와 PostContent를 남기지 않는다

#### Scenario: 조회할 수 없는 Parent

- **WHEN** Parent가 요청 Profile 기준 Visibility 또는 Eligibility를 통과하지 못한다
- **THEN** 시스템은 없는 Parent와 구분할 수 없게 생성을 거부한다
- **AND** Parent 또는 새 Post의 데이터를 노출하지 않는다

#### Scenario: 잘못된 global ID type

- **WHEN** `replyParentId`가 concrete `Post` global ID가 아니다
- **THEN** 시스템은 입력 검증 오류로 요청을 거부한다
- **AND** 다른 Node type의 로더로 재시도하지 않는다

### Requirement: Reply 생성의 원자성

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-424` 시스템은 Parent 조회·Content 검증과 Reply Post·Content·Reply Parent 연결을 하나의 transaction에서 완료해야 한다(MUST).

#### Scenario: Reply 저장 성공

- **WHEN** Parent 검증과 Reply 저장의 모든 단계가 성공한다
- **THEN** 새 Post의 `currentContentId`는 새 Content를, `replyParentId`는 입력 Parent를 참조한다
- **AND** `repostSourceId`는 `null`이다

#### Scenario: transaction 중간 실패

- **WHEN** Parent 검증, Content 생성, Post 관계 연결 중 어느 한 단계가 실패한다
- **THEN** 시스템은 Reply 생성 transaction 전체를 rollback한다
- **AND** 부분적인 Post, Content 또는 Reply Parent 관계를 남기지 않는다
