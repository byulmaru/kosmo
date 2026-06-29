## ADDED Requirements

### Requirement: Fedify outbox ingestion boundary

시스템은 remote outbox와 ActivityPub object 처리에서 Fedify dereference/vocabulary API를 재사용해야 한다(MUST).

#### Scenario: Use Fedify for remote outbox traversal

- **WHEN** 시스템이 remote profile outbox를 refresh한다
- **THEN** 시스템은 Fedify vocabulary/dereference API로 outbox collection과 item을 읽는다
- **AND** 시스템은 별도 ActivityPub collection parser나 JSON-LD dereferencer를 직접 구현하지 않는다

### Requirement: Remote outbox Note ingestion

시스템은 remote profile의 outbox에서 public ActivityPub Note를 가져와 kosmo `Post`로 materialize해야 한다(MUST).

#### Scenario: Ingest public remote notes

- **WHEN** 시스템이 remote profile의 `Profile.posts`를 해석하기 위해 remote actor outbox를 조회한다
- **THEN** 시스템은 Fedify vocabulary/dereference API로 outbox collection과 item을 읽는다
- **AND** 시스템은 `Create` activity 또는 직접 Note object 중 public으로 볼 수 있는 Note를 찾는다
- **AND** 시스템은 각 Note의 ActivityPub object URI를 unique identity로 저장한다
- **AND** 시스템은 중복 object URI에 대해 새 `Post`를 만들지 않고 기존 `Post`를 갱신한다
- **AND** 시스템은 materialized remote posts를 `Profile.posts` connection에서 반환할 수 있게 한다

#### Scenario: Skip non-public or unsupported remote objects

- **WHEN** remote outbox object가 public Note로 판정되지 않거나 Note가 아닌 ActivityPub object이다
- **THEN** 시스템은 해당 object를 `Post`로 materialize하지 않는다
- **AND** 시스템은 reply/thread, announce, like, private/direct object 처리를 후속 변경으로 남긴다

#### Scenario: Project remote Note content

- **WHEN** 시스템이 remote Note를 `Post`로 materialize한다
- **THEN** 시스템은 Note 작성자를 remote profile로 저장한다
- **AND** 시스템은 Note published 시각을 `Post.createdAt`으로 저장한다
- **AND** 시스템은 Note HTML content를 `PostContent.bodyHtml`로 저장할 수 있다
- **AND** 시스템은 Note content에서 plain text projection을 만들어 `PostContent.bodyText`로 저장한다
- **AND** 시스템은 plain text projection에서 단순 TipTap document를 만들어 `PostContent.bodyJson`으로 저장한다

#### Scenario: Refresh remote outbox shallowly

- **WHEN** remote profile의 posts materialization이 없거나 stale 상태이다
- **THEN** 시스템은 GraphQL `Profile.posts` 요청 중 Fedify dereference/vocabulary API로 remote outbox refresh를 시도할 수 있다
- **AND** refresh가 실패하면 이미 materialized된 remote posts만 반환할 수 있다
