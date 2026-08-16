## MODIFIED Requirements

### Requirement: Post 삭제는 owner-scoped Tombstone transition과 GraphQL payload를 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, PROD-725, PROD-777 — Post 삭제는 row를 물리 삭제하지 않고 owner가 수행하는 `UPDATE post SET state = DELETED, deleted_at = now() ... RETURNING currentContentId, id, replyParentId, repostSourceId` Tombstone transition이어야 한다(MUST). Active Post의 owner 삭제는 viewer visibility와 무관하게 허용되어야 하며(MUST), GraphQL payload는 `postId`와 nullable `repostSource`를 기존대로 제공해야 한다(MUST). 최초 pure Repost Tombstone commit은 delete transition effects Workflow start를 시도해야 하며(MUST), pure Repost 삭제 경로의 caller가 database handle·`postCommit` 또는 Repost Notification cleanup을 직접 조립해서는 안 된다(MUST NOT). ordinary Post·Reply·Quote 삭제의 caller 경계와 효과 전환은 PROD-677 범위에 남겨야 한다(MUST).

#### Scenario: owner가 visibility와 무관하게 Active Post를 Tombstone으로 전환함

- **WHEN** Post Author가 visibility와 무관하게 Active Post 삭제를 요청한다
- **THEN** 시스템은 Post row를 물리 삭제하지 않고 `state=DELETED`, `deleted_at=now()`로 전환한다
- **AND** Tombstone UPDATE의 반환 값으로 GraphQL `postId`와 nullable `repostSource` payload를 만든다

#### Scenario: DELETED Post의 반복 삭제는 idempotent payload를 반환함

- **WHEN** 같은 owner가 이미 DELETED인 Post를 다시 삭제한다
- **THEN** 시스템은 동일한 `postId`와 `repostSource` payload를 반환한다
- **AND** Post row와 최초 `deleted_at`을 다시 전환하지 않는다
- **AND** 새로운 effects Workflow를 시작하지 않는다

#### Scenario: 다른 owner와 누락된 Post는 전환하지 않음

- **WHEN** 다른 Profile이 Post를 삭제하거나 대상 Post가 존재하지 않는다
- **THEN** 시스템은 각각 `PERMISSION_DENIED` 또는 `NOT_FOUND`를 반환한다
- **AND** Post state, `deleted_at`, payload와 effects Workflow를 변경하지 않는다

#### Scenario: pure Repost만 Tombstone 이후 effects Workflow를 시작함

- **WHEN** Content와 Reply Parent가 없고 Repost Source가 있는 Active pure Repost가 처음 Tombstone으로 전환되어 commit된다
- **THEN** 시스템은 committed Repost ID와 delete transition identity로 effects Workflow start를 시도한다
- **AND** start 또는 effects 실패는 Tombstone 전환과 GraphQL 성공 payload를 바꾸지 않는다

#### Scenario: ordinary Post와 Quote·reply는 Repost effects 대상이 아님

- **WHEN** Content가 있는 ordinary Post, Quote 또는 reply가 Tombstone으로 전환된다
- **THEN** pure Repost 전용 effects Workflow를 시작하지 않는다
- **AND** 각 Post의 기존 deletion과 delivery lifecycle은 유지한다
