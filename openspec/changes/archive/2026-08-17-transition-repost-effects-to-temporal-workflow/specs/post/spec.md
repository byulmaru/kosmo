## MODIFIED Requirements

### Requirement: Post 삭제는 owner-scoped Tombstone transition과 GraphQL payload를 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-677, PROD-725, PROD-777 — Post 삭제는 row를 물리 삭제하지 않고 owner가 수행하는 `UPDATE post SET state = DELETED, deleted_at = now() ... RETURNING currentContentId, id, replyParentId, repostSourceId` Tombstone transition이어야 한다(MUST). Active Post의 owner 삭제는 viewer visibility와 무관하게 허용되어야 하며(MUST), GraphQL payload는 `postId`와 nullable `repostSource`를 기존대로 제공해야 한다(MUST). Content-bearing Post·Reply·Quote의 최초 Tombstone commit은 `postDeleteWorkflow`를, Content 없는 pure Repost의 최초 Tombstone commit은 `repostDeleteWorkflow`를 각각 stable Post ID identity로 시작해야 한다(MUST). 두 Workflow input은 `{ postId, origin }`이며 discriminator를 포함하지 않는다. Verified ActivityPub Delete ingress는 actor/object URI와 저장된 mapping을 read-only로 내부 identity에 해석한 뒤 공통 `deletePost`에 전달하고, mapping lookup과 domain Tombstone transition을 하나의 atomic transaction이라고 주장하지 않아야 한다(MUST NOT). Delete caller가 database handle·`postCommit` 또는 후속 효과를 직접 조립해서는 안 된다(MUST NOT). ordinary Post·Reply·Quote 삭제의 적용·검증 책임은 PROD-677 범위에 남겨야 한다(MUST).

#### Scenario: owner가 visibility와 무관하게 Active Post를 Tombstone으로 전환함

- **WHEN** Post Author가 visibility와 무관하게 Active Post 삭제를 요청한다
- **THEN** 시스템은 Post row를 물리 삭제하지 않고 `state=DELETED`, `deleted_at=now()`로 전환한다
- **AND** Tombstone UPDATE의 반환 값으로 GraphQL `postId`와 nullable `repostSource` payload를 만든다

#### Scenario: DELETED Post의 반복 삭제는 idempotent payload를 반환함

- **WHEN** 같은 owner가 이미 DELETED인 Post를 다시 삭제한다
- **THEN** 시스템은 동일한 `postId`와 `repostSource` payload를 반환한다
- **AND** Post row와 최초 `deleted_at`을 다시 전환하지 않는다
- **AND** 새로운 Delete Workflow를 시작하지 않는다

#### Scenario: 다른 owner와 누락된 Post는 전환하지 않음

- **WHEN** 다른 Profile이 Post를 삭제하거나 대상 Post가 존재하지 않는다
- **THEN** 시스템은 각각 `PERMISSION_DENIED` 또는 `NOT_FOUND`를 반환한다
- **AND** Post state, `deleted_at`, payload와 Delete Workflow를 변경하지 않는다

#### Scenario: 모든 최초 Tombstone이 구조별 Delete Workflow를 시작함

- **WHEN** Active Post가 처음 Tombstone으로 전환되어 commit된다
- **THEN** 시스템은 Content-bearing Post·Reply·Quote이면 `post-delete:{postId}` identity의 Post Delete Workflow를, pure Repost이면 `repost-delete:{postId}` identity의 Repost Delete Workflow start를 시도한다
- **AND** start 또는 effects 실패는 Tombstone 전환과 GraphQL 성공 payload를 바꾸지 않는다

#### Scenario: Content Post deletion uses Post Delete Workflow

- **WHEN** Content가 있는 ordinary Post, Quote, Reply 또는 Reply이면서 Quote가 Tombstone으로 전환된다
- **THEN** 시스템은 `post-delete:{postId}` identity의 Post Delete Workflow를 시작한다
- **AND** `origin=LOCAL`이면 canonical Delete(Note) queue handoff를, `origin=ACTIVITYPUB`이면 outbound echo 없이 완료한다
- **AND** 각 Post의 기존 deletion payload와 delivery lifecycle을 유지한다

#### Scenario: verified ActivityPub Delete delegates to common Post delete

- **WHEN** verified ActivityPub ingress가 exact actor/object mapping과 ownership chain을 read-only로 확인해
  `actorProfileId`와 `postId`를 해석한다
- **THEN** ingress는 해당 내부 identity와 `origin=ACTIVITYPUB`을 공통 `deletePost`에 전달한다
- **AND** `deletePost`는 자체 Tombstone transaction을 commit한 뒤 `postDeleteWorkflow` start를 시도한다
- **AND** ingress lookup과 domain transition 사이에 caller database handle·`postCommit` 또는 별도 lock을 사용하지 않는다
