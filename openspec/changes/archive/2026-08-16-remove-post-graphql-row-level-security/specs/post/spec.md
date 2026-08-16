## MODIFIED Requirements

### Requirement: Post GraphQL object

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, PROD-777 — GraphQL Post authorization과 visibility는 중앙 application policy가 집행해야 하며(MUST), PostgreSQL RLS 또는 actor GUC에 의존해서는 안 된다(MUST NOT). API는 활성 게시글을 GraphQL `Post` Node로 노출해야 하며 작성자 프로필, 현재 콘텐츠, 공개 범위, 상태, 생성 시각을 제공해야 한다(MUST).

#### Scenario: 활성 게시글 object 조회

- **WHEN** 클라이언트가 노출 가능한 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다
- **AND** `Post`는 `id`, `profile`, `content`, `visibility`, `state`, `createdAt` 필드를 포함한다
- **AND** `profile`은 게시글 작성자 프로필을 가리킨다
- **AND** `content`는 게시글의 현재 콘텐츠를 가리킨다

#### Scenario: 공개 게시글 object 조회

- **WHEN** 클라이언트가 `PUBLIC` 또는 `UNLISTED` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: 작성자 본인의 비공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자이고 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: follower의 팔로워 공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자를 팔로우하고 `FOLLOWERS` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: 접근 권한 없는 viewer의 비공개 게시글 object 조회

- **WHEN** 인증되지 않았거나, 현재 active profile이 게시글 작성자가 아니고 게시글 작성자를 팔로우하지 않는 클라이언트가 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 게시글 Node를 조회한다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다
- **AND** `DIRECT` viewer 기준 세부 접근 제어는 후속 변경에서 정의한다

#### Scenario: 비활성 게시글 object 조회

- **WHEN** 게시글 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다

#### Scenario: application policy가 유일한 GraphQL 권한 집행 경계임

- **WHEN** GraphQL Post Node를 조회하고 application visibility/eligibility policy가 결과를 결정한다
- **THEN** 기존 Post authorization과 visibility 결과를 반환한다
- **AND** PostgreSQL RLS policy나 actor GUC가 없어도 같은 application policy 결과를 반환한다

## ADDED Requirements

### Requirement: Post 삭제는 owner-scoped Tombstone transition과 GraphQL payload를 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, PROD-777 — Post 삭제는 row를 물리 삭제하지 않고 owner가 수행하는 `UPDATE post SET state = DELETED, deleted_at = now() ... RETURNING currentContentId, id, replyParentId, repostSourceId` Tombstone transition이어야 한다(MUST). Active Post의 owner 삭제는 viewer visibility와 무관하게 허용되어야 하며(MUST), GraphQL payload는 `postId`와 nullable `repostSource`를 기존대로 제공해야 한다(MUST).

#### Scenario: owner가 visibility와 무관하게 Active Post를 Tombstone으로 전환함

- **WHEN** Post Author가 visibility와 무관하게 Active Post 삭제를 요청한다
- **THEN** 시스템은 Post row를 물리 삭제하지 않고 `state=DELETED`, `deleted_at=now()`로 전환한다
- **AND** Tombstone UPDATE의 반환 값으로 GraphQL `postId`와 nullable `repostSource` payload를 만든다

#### Scenario: DELETED Post의 반복 삭제는 idempotent payload를 반환함

- **WHEN** 같은 owner가 이미 DELETED인 Post를 다시 삭제한다
- **THEN** 시스템은 동일한 `postId`와 `repostSource` payload를 반환한다
- **AND** Post row와 최초 `deleted_at`을 다시 전환하지 않는다
- **AND** 새로운 post-commit effect를 실행하지 않는다

#### Scenario: 다른 owner와 누락된 Post는 전환하지 않음

- **WHEN** 다른 Profile이 Post를 삭제하거나 대상 Post가 존재하지 않는다
- **THEN** 시스템은 각각 `PERMISSION_DENIED` 또는 `NOT_FOUND`를 반환한다
- **AND** Post state, `deleted_at`, payload와 post-commit effect를 변경하지 않는다

#### Scenario: pure Repost만 Tombstone 이후 Notification cleanup을 수행함

- **WHEN** Content와 Reply Parent가 없고 Repost Source가 있는 Active pure Repost가 처음 Tombstone으로 전환된다
- **THEN** commit 이후 삭제된 pure Repost row의 `REPOST` Notification을 `sourceId = deleted post.id` 기준으로 한 번 cleanup한다
- **AND** cleanup 실패는 로그로 격리되며 Tombstone 전환과 GraphQL 성공 payload를 바꾸지 않는다

#### Scenario: ordinary Post와 Quote·reply는 Repost Notification cleanup 대상이 아님

- **WHEN** Content가 있는 ordinary Post, Quote 또는 reply가 Tombstone으로 전환된다
- **THEN** pure Repost 전용 Repost Notification cleanup을 수행하지 않는다
- **AND** 각 Post의 기존 deletion과 delivery lifecycle은 유지한다
