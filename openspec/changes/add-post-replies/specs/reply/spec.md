## ADDED Requirements

### Requirement: Post 관계 조합으로 Reply 구조 판정

**Authority / Provenance:** `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `PROD-388`, `PROD-393` 시스템은 Content, Reply Parent와 Repost Source의 존재 조합으로 Post 구조를 판정해야 하며(MUST), Reply Parent와 Repost Source를 배타적인 종류 값으로 취급해서는 안 된다(MUST NOT).

#### Scenario: 일반 Post

- **WHEN** Post가 Content만 가진다
- **THEN** 시스템은 그 구조를 일반 Post로 허용한다

#### Scenario: Reply

- **WHEN** Post가 Content와 Reply Parent를 가지고 Repost Source는 가지지 않는다
- **THEN** 시스템은 그 구조를 Reply로 허용한다

#### Scenario: Quote

- **WHEN** Post가 Content와 Repost Source를 가지고 Reply Parent는 가지지 않는다
- **THEN** 시스템은 그 구조를 Quote로 허용한다

#### Scenario: Reply이면서 Quote

- **WHEN** Post가 Content, Reply Parent와 Repost Source를 모두 가진다
- **THEN** 시스템은 그 구조를 Reply이면서 Quote인 Post로 허용한다

#### Scenario: Content 없는 Repost

- **WHEN** Post가 Content와 Reply Parent 없이 Repost Source만 가진다
- **THEN** 시스템은 그 구조를 Repost로 허용한다

#### Scenario: 관계 없는 contentless Post 거부

- **WHEN** Post가 Content와 Repost Source를 모두 가지지 않는다
- **THEN** 시스템은 그 구조를 거부한다

#### Scenario: Content 없는 Reply 거부

- **WHEN** Post가 Content 없이 Reply Parent를 가진다
- **THEN** 시스템은 그 구조를 거부한다

### Requirement: Reply 관계 생성 검증

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-393` 시스템은 Reply Parent를 생성 시 한 번만 직접 연결해야 하며(MUST), Parent는 이미 존재하고 Content를 가진 Post여야 한다(MUST).

#### Scenario: 존재하는 contentful Parent 연결

- **WHEN** 새 contentful Post가 이미 존재하는 contentful Parent를 입력받는다
- **THEN** 시스템은 Content와 Reply Parent를 같은 transaction에서 연결한다

#### Scenario: 존재하지 않는 관계 대상

- **WHEN** 입력 Reply Parent가 존재하지 않는다
- **THEN** 시스템은 `NotFoundError('Post not found')`로 생성을 거부한다
- **AND** transaction에서 생성한 Post와 Content를 남기지 않는다

#### Scenario: Content 없는 관계 대상

- **WHEN** 입력 Reply Parent가 Content를 가지지 않는다
- **THEN** 시스템은 `replyParentId` field의 `ValidationError`로 생성을 거부한다
- **AND** transaction에서 생성한 Post와 Content를 남기지 않는다

#### Scenario: 직접 self-reference 입력

- **WHEN** 새 Post의 식별자가 Reply Parent로 입력된다
- **THEN** 시스템은 `replyParentId` field의 `ValidationError`로 생성을 거부한다

#### Scenario: 생성 전용 acyclic 관계

- **WHEN** 새 Post가 이미 존재하는 Parent만 직접 참조하고 생성 후 Reply Parent 변경 경로를 제공하지 않는다
- **THEN** 정상 core 생성 경로는 다단계 cycle을 만들지 않는다
- **AND** 시스템은 정상 생성에 재귀 cycle 탐색이나 constraint trigger를 요구하지 않는다

### Requirement: Reply의 Home/Profile Post List 후보 정책

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-388`, `PROD-429` 시스템은 각 Post의 Visibility와 Eligibility를 먼저 적용한 뒤 Home Post List에 승인된 Reply 후보를 포함하고 Profile Post List에서는 Reply Parent가 있는 Post를 제외해야 한다(MUST).

#### Scenario: Home에서 viewer 관련 Reply 포함

- **WHEN** Reply가 viewer Profile의 Post에 달렸거나 viewer가 작성했거나, viewer가 팔로우한 Profile의 Post에 viewer가 팔로우한 Profile이 작성했다
- **THEN** 시스템은 Reply 자체가 Visibility와 Eligibility를 통과하면 Home 후보에 포함한다
- **AND** Reply이면서 Quote인 Post에도 같은 규칙을 적용한다

#### Scenario: Home에서 관련 없는 Reply 제외

- **WHEN** Reply가 Home의 viewer 관련 Reply 조건을 충족하지 않는다
- **THEN** 시스템은 그 Reply를 page limit 적용 전에 Home 후보에서 제외한다

#### Scenario: Profile에서 Reply 제외

- **WHEN** Target Profile이 Reply Parent가 있는 Post를 작성했다
- **THEN** 시스템은 Reply이면서 Quote인 경우를 포함해 그 Post를 Profile Post List 후보에서 제외한다

### Requirement: Hashtag Post List의 Reply 제외 정책

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `PROD-388` 시스템은 Public Visibility와 Content, Hashtag 조건을 충족하더라도 Reply Parent가 있는 Post를 Hashtag Post List 후보에 포함하지 않아야 한다(MUST).

> 현재 Hashtag Post List query/resolver 표면은 없으므로 이 requirement의 구현·회귀 검증은 PROD-429의 현재 구현 slice가 아니라 Hashtag capability를 도입하는 후속 구현 slice와 부모 통합 검증에서 소유한다.

#### Scenario: Hashtag에서 Reply 제외

- **WHEN** Public Post가 Target Hashtag를 포함하지만 Reply Parent를 가진다
- **THEN** 시스템은 그 Post를 Hashtag Post List 후보에서 제외한다

### Requirement: Reply 조상 경로 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-399` 시스템은 Reply의 저장된 직접 Reply Parent 관계를 따라 viewer가 조회할 수 있는 조상 Post 경로를 제공해야 한다(MUST).

#### Scenario: 조회 가능한 조상 경로

- **WHEN** viewer가 여러 단계의 조회 가능한 Reply Parent를 가진 Reply를 조회한다
- **THEN** 시스템은 저장된 직접 Parent 관계 순서를 보존한 조상 Post들을 제공한다
- **AND** 각 조상은 기존 단일 `Post` Node 계약을 사용한다

#### Scenario: 조회 불가능한 조상에서 중단

- **WHEN** 조상 경로의 Parent가 Tombstone이거나 viewer 기준 Visibility 또는 Eligibility를 통과하지 못한다
- **THEN** 시스템은 그 Parent에서 조상 경로를 중단한다
- **AND** 숨겨진 Parent를 건너뛰거나 더 위의 조상으로 관계를 평탄화하지 않는다

#### Scenario: 비정상 cycle 방어

- **WHEN** 정상 생성 경로 밖의 데이터로 조상 관계에 cycle이 존재한다
- **THEN** 시스템은 조회를 유한하게 종료한다
- **AND** 같은 Post를 반복 노출하지 않는다

### Requirement: 하위 Reply 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-400` 시스템은 현재 Post를 직접 또는 간접 Reply Parent로 참조하는 모든 조회 가능한 descendant Post를 제공해야 하며(MUST), 각 descendant의 Visibility와 Eligibility를 독립적으로 적용해야 한다(MUST).

#### Scenario: 직접·간접 하위 Reply 제공

- **WHEN** 현재 Post 아래에 조회 가능한 직접 Reply와 간접 Reply가 존재한다
- **THEN** 시스템은 두 종류의 descendant를 모두 제공한다
- **AND** Reply이면서 Quote인 descendant도 같은 규칙으로 포함한다

#### Scenario: 숨겨진 Parent 아래의 visible Reply

- **WHEN** 중간 Parent는 viewer가 조회할 수 없지만 그 아래 descendant Reply는 독립적으로 조회할 수 있다
- **THEN** 시스템은 숨겨진 Parent의 Content를 노출하지 않는다
- **AND** 조회 가능한 descendant Reply를 Parent 비노출만을 이유로 제거하지 않는다

#### Scenario: Source를 조회할 수 없는 Reply이면서 Quote

- **WHEN** Reply이면서 Quote인 descendant 자체는 조회 가능하지만 Repost Source는 조회할 수 없다
- **THEN** 시스템은 그 descendant와 자체 Content를 하위 Reply 결과에 유지한다
- **AND** nullable Repost Source 관계만 독립적으로 숨긴다
