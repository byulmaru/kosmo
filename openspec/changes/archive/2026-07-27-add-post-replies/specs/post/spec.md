## ADDED Requirements

### Requirement: Post의 직접 Reply Parent 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-398` API는 기존 단일 GraphQL `Post` Node에 nullable `replyParent` field를 제공해야 하며(MUST), 현재 Post와 Parent의 Visibility와 Eligibility를 독립적으로 판정해야 한다(MUST).

#### Scenario: 직접 Parent 조회

- **WHEN** 조회 가능한 Post가 조회 가능한 직접 Reply Parent를 가진다
- **THEN** `Post.replyParent`는 저장된 직접 Parent를 기존 `Post` Node로 반환한다
- **AND** 다른 Post로 평탄화하지 않는다

#### Scenario: Reply Parent가 없는 Post

- **WHEN** 조회 가능한 Post가 Reply Parent를 가지지 않는다
- **THEN** `Post.replyParent`는 `null`을 반환한다

#### Scenario: 조회 불가능한 Parent

- **WHEN** 현재 Post는 조회 가능하지만 Parent가 Tombstone이거나 viewer 기준 Visibility 또는 Eligibility를 통과하지 못한다
- **THEN** 현재 Post 조회는 유지한다
- **AND** `Post.replyParent`만 `null`을 반환한다

### Requirement: Post의 Reply 조상 경로 GraphQL 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-399` API는 기존 단일 GraphQL `Post` Node에 pagination 없는 non-null `replyAncestors: [Post!]!` field를 제공해야 하며(MUST), 저장된 직접 Reply Parent부터 root 방향으로 조회 가능한 조상을 반환해야 한다(MUST).

#### Scenario: 직접 Parent 우선 조상 list

- **WHEN** 조회 가능한 Post가 여러 단계의 조회 가능한 Reply Parent를 가진다
- **THEN** `Post.replyAncestors`는 직접 Parent를 첫 요소로 반환한다
- **AND** 이후 요소는 저장된 Reply Parent 관계를 따라 root 방향으로 이어진다

#### Scenario: 조상이 없는 Post

- **WHEN** 조회 가능한 Post가 Reply Parent를 가지지 않거나 직접 Parent부터 조회할 수 없다
- **THEN** `Post.replyAncestors`는 빈 배열을 반환한다

#### Scenario: 조상 경로 pagination 제외

- **WHEN** 클라이언트가 Reply 조상 경로를 조회한다
- **THEN** API는 Relay connection이나 pagination 인자 없이 전체 조회 가능 경로를 non-null list로 반환한다
