## ADDED Requirements

### Requirement: ActivityPub object mapping storage

시스템은 remote ActivityPub Note object URI와 kosmo Post identity를 하나의 mapping으로 저장해야 한다(MUST).

#### Scenario: Store a remote Note mapping

- **WHEN** remote Note가 최초로 materialize된다
- **THEN** 시스템은 `activitypub_object`에 PostgreSQL `uuidv7()` default로 생성한 `id`, unique `uri`, `type = NOTE`, `activityPubActorId`, unique `postId`, `receivedAt`과 nullable `publishedAt`을 저장한다
- **AND** `activityPubActorId`는 indexed non-unique foreign key이고 actor 삭제는 RESTRICT한다
- **AND** `postId` foreign key는 Post 삭제 시 mapping을 CASCADE 삭제한다
- **AND** actor URI를 mapping에 중복 저장하지 않고 object type 자체에는 unique constraint를 두지 않는다

#### Scenario: Assign object identity metadata

- **WHEN** ActivityPub object mapping schema를 추가한다
- **THEN** 시스템은 `ActivityPubObjectType.NOTE`와 PostgreSQL enum을 추가하고 `activitypub_object.id`는 table discriminator가 없는 PostgreSQL UUIDv7 default를 사용한다
- **AND** 같은 actor가 여러 NOTE mapping을 가질 수 있다

#### Scenario: Reject duplicate object identity

- **WHEN** 같은 object URI 또는 같은 Post mapping을 둘 이상 직접 저장한다
- **THEN** PostgreSQL unique constraint가 duplicate row를 거부한다
- **AND** 시스템은 별도 inbox activity receipt나 activity ID column을 요구하지 않는다
