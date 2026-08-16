## ADDED Requirements

### Requirement: Bookmark owner enforcement는 selected Profile application policy가 소유한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md` — Bookmark owner enforcement MUST be performed by the centralized application policy using the selected Profile, and its authorization result MUST NOT depend on PostgreSQL RLS or actor GUC. The current operation session removal belongs to PROD-779. Also, `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`, PROD-778.

Bookmark owner authorization은 기존 GraphQL application policy의 selected Profile 경계를 따른다. RLS
철회는 기존 Bookmark 제품 계약을 재정의하지 않으며, 이 delta는 해당 owner enforcement의 durable target
경계만 추가한다.

#### Scenario: GraphQL Bookmark 경로가 selected Profile owner policy를 사용함

- **WHEN** selected Profile이 Bookmark Node, `Profile.bookmarks`, `Post.viewerBookmark`, `createBookmark` 또는 `deleteBookmark`를 사용하면
- **THEN** owner 접근은 중앙 application policy로 판정되고 그 authorization 결과는 PostgreSQL Bookmark RLS 또는 actor GUC에 의존하지 않는다
- **AND** 현재 operation session 제거는 PROD-779 범위로 남는다

### Requirement: RLS 철회 뒤 기존 Bookmark owner와 GraphQL 계약을 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-778 — Existing Bookmark owner behavior and GraphQL contracts MUST remain unchanged after Bookmark RLS removal.

RLS 철회 뒤에도 hidden/deleted 또는 현재 조회 불가능한 Target Post에 대한 Owner의 Bookmark row 유지와
삭제 동작을 보존해야 한다(MUST). `Bookmark.post`의 nullable 노출, `Profile.bookmarks` connection edge
필터, `Post.viewerBookmark`, `createBookmark`, `deleteBookmark`와 `DELETE RETURNING` 기반 payload의 기존
shape·pagination·멱등성·cache 계약은 변경하지 않아야 한다(MUST). Bookmark에 현재 정의된 Notification 동작은
변경하지 않고 이 change 범위에서 제외해야 한다(MUST).

#### Scenario: hidden Target에서도 Owner Bookmark 동작을 보존함

- **WHEN** Owner가 저장한 Target Post가 Tombstone이거나 현재 Post 조회 정책을 통과하지 못한 상태에서 Bookmark Node 또는 delete mutation을 사용하면
- **THEN** Bookmark row와 Owner 권한은 유지되고 `Bookmark.post` 및 delete payload의 `post`는 기존 계약에 따라 `null`이 될 수 있다

#### Scenario: 기존 Bookmark GraphQL 계약을 유지함

- **WHEN** Owner가 Bookmark Node, connection, viewer relation 또는 create/delete mutation을 사용하면
- **THEN** 기존 성공·null·멱등 payload, `DELETE RETURNING` 결과, pagination 및 cache 의미를 유지하고 다른 Profile의 Bookmark를 노출하지 않는다
