## ADDED Requirements

### Requirement: ActivityPub Post mapping storage

시스템은 materialize된 remote ActivityPub Post URI와 kosmo Post identity를 하나의 최소 mapping으로 저장해야 한다(MUST).

#### Scenario: Store a remote Note mapping

- **WHEN** remote Note가 최초로 materialize된다
- **THEN** 시스템은 `activitypub_post`에 PostgreSQL `uuidv7()` default로 생성한 `id`, unique `uri`, unique `postId`, `receivedAt`과 nullable `publishedAt`만 저장한다
- **AND** `postId` foreign key는 Post 삭제 시 mapping을 CASCADE 삭제한다
- **AND** 일반 Post soft delete는 mapping을 보존한다

#### Scenario: Keep protocol validation outside the mapping

- **WHEN** 지원되는 remote Note가 Post로 materialize된다
- **THEN** mapping은 raw ActivityPub object type을 저장하지 않는다
- **AND** mapping은 `activityPubActorId`를 저장하지 않고 작성자 identity를 `Post.profileId`와 unique `ActivityPubActor.profileId` 관계에서 도출한다
- **AND** `activitypub_post.id`는 table discriminator가 없는 PostgreSQL UUIDv7 default를 사용한다

#### Scenario: Reject duplicate object identity

- **WHEN** 같은 object URI 또는 같은 Post mapping을 둘 이상 직접 저장한다
- **THEN** PostgreSQL unique constraint가 duplicate row를 거부한다
- **AND** 시스템은 별도 inbox activity receipt나 activity ID column을 요구하지 않는다
