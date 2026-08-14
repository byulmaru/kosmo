# bookmark-graphql-row-level-security Specification

## Purpose

TBD - created by archiving change apply-bookmark-graphql-owner-rls. Update Purpose after archive.

## Requirements

### Requirement: Bookmark에 GraphQL principal RLS를 활성화한다

**Authority / Provenance:** `docs/domain/objects/bookmark.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-771 — 시스템은 MUST `public.bookmark`에 ROW LEVEL SECURITY를 활성화한다. FORCE ROW LEVEL SECURITY는 MUST NOT 활성화한다. 정책은 MUST `kosmo_api`에만 명시적으로 적용하고, `kosmo_worker`용 정책이나 전체 role 대상 policy를 MUST NOT 만든다.

#### Scenario: GraphQL principal에 Bookmark RLS가 적용됨

- **WHEN** `kosmo_api`가 Bookmark row를 조회·생성·삭제한다
- **THEN** PostgreSQL은 해당 command의 `kosmo_api` Bookmark policy를 적용한다

#### Scenario: owner와 Worker 경계는 우회 결과를 유지함

- **WHEN** table owner 또는 `BYPASSRLS=true`인 `kosmo_worker`가 Bookmark SQL을 실행한다
- **THEN** FORCE RLS가 없으므로 기존 owner/Worker 결과를 유지한다
- **AND** 이 change는 두 role의 object ACL, membership 또는 credential을 변경하지 않는다

### Requirement: selected Profile 기준 Bookmark owner policy를 강제한다

**Authority / Provenance:** `docs/domain/objects/bookmark.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-771 — `kosmo_api`의 Bookmark SELECT와 DELETE policy는 MUST `bookmark.profile_id = public.kosmo_current_profile_id()`인 row만 허용한다. INSERT policy는 MUST 새 row의 `profile_id`가 같은 current Profile ID일 때만 허용한다. 다른 selected Profile, selected Profile이 없는 context와 비어 있거나 잘못된 Profile actor setting은 MUST NOT Bookmark row에 접근할 수 있다.

#### Scenario: Owner가 자기 Bookmark를 조회함

- **WHEN** `kosmo_api` current Profile이 Bookmark의 `profile_id`와 같다
- **THEN** 해당 Bookmark row를 조회할 수 있다

#### Scenario: 다른 selected Profile이 Bookmark ID를 알고 있음

- **WHEN** `kosmo_api` current Profile이 Bookmark의 `profile_id`와 다르다
- **THEN** SELECT는 해당 row를 반환하지 않는다
- **AND** DELETE는 해당 row를 제거하지 않는다

#### Scenario: current Profile context가 유효하지 않음

- **WHEN** Profile actor setting이 없거나 비어 있거나 UUID가 아닌 값이라 `public.kosmo_current_profile_id()`가 `NULL`을 반환한다
- **THEN** `kosmo_api`는 Bookmark row를 조회·생성·삭제할 수 없다

#### Scenario: Owner Profile로 Bookmark를 생성함

- **WHEN** `kosmo_api`가 current Profile ID와 같은 `profile_id`를 가진 Bookmark를 INSERT한다
- **THEN** PostgreSQL은 row 생성을 허용한다

#### Scenario: 다른 Profile 소유 Bookmark 생성을 시도함

- **WHEN** `kosmo_api`가 current Profile ID와 다른 `profile_id`를 가진 Bookmark를 INSERT한다
- **THEN** PostgreSQL은 row 생성을 거부한다

### Requirement: Bookmark row 권한과 Target Post 노출을 분리한다

**Authority / Provenance:** `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-771 — Bookmark RLS owner predicate는 MUST NOT Target Post의 visibility 또는 lifecycle을 다시 판정한다. Target Post가 Tombstone이거나 Owner Profile에게 조회 불가능해도 시스템은 MUST Owner의 Bookmark row와 생성 시각을 유지하고 Owner가 해당 row를 삭제할 수 있게 한다. `Bookmark.post`와 `Profile.bookmarks` connection의 edge 노출은 MUST 기존 Post 조회 경계를 따른다.

#### Scenario: 숨겨진 Target의 Bookmark Node를 조회함

- **WHEN** current Profile이 Bookmark Owner지만 Target Post는 기존 Post 조회 경계를 통과하지 못한다
- **THEN** Owner의 Bookmark row와 GraphQL Bookmark Node는 유지된다
- **AND** `Bookmark.post`는 `null`을 반환한다

#### Scenario: 숨겨진 Target의 Bookmark를 삭제함

- **WHEN** current Profile이 Bookmark Owner이고 Target Post는 기존 Post 조회 경계를 통과하지 못한다
- **THEN** Owner는 Target Post visibility와 관계없이 Bookmark row를 삭제할 수 있다
- **AND** 기존 GraphQL delete payload는 삭제된 Bookmark ID와 `post: null`을 반환한다

#### Scenario: 숨겨진 Target이 owner connection에 존재함

- **WHEN** Owner의 Bookmark row가 조회 가능하지만 Target Post는 기존 Post 조회 경계를 통과하지 못한다
- **THEN** `Profile.bookmarks`는 해당 Bookmark edge를 결과에서 제외한다
- **AND** Bookmark RLS는 row를 삭제하거나 숨기지 않는다

### Requirement: 기존 GraphQL owner 계약과 후속 운영 경계를 유지한다

**Authority / Provenance:** `docs/domain/objects/bookmark.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-771, PROD-767 — 이 change는 MUST NOT Bookmark Node, `Profile.bookmarks`, `Post.viewerBookmark`, `createBookmark`와 `deleteBookmark`의 기존 GraphQL shape, payload, pagination, 멱등성과 cache 계약을 변경한다. 기존 application owner predicate는 MUST Project-level contract owner가 제거를 승인하기 전까지 유지한다. 다른 table RLS와 production preflight, sync/apply, principal cutover 및 live 검증은 MUST 이 capability의 구현·archive 완료 조건과 분리하고 별도 명시 승인을 요구한다.

#### Scenario: RLS migration만 준비됨

- **WHEN** Bookmark RLS 구현과 비운영 검증이 완료됐지만 GraphQL workload가 아직 owner credential을 사용한다
- **THEN** 기존 GraphQL 동작은 유지된다
- **AND** 이를 `kosmo_api` principal cutover나 production 적용 완료 증거로 사용하지 않는다

#### Scenario: 기존 Bookmark GraphQL 경로를 실행함

- **WHEN** Owner가 Bookmark Node, connection, viewer relation 또는 create/delete Mutation을 사용한다
- **THEN** 기존 성공·null·멱등 payload와 pagination 계약을 유지한다
- **AND** PostgreSQL owner policy가 같은 selected Profile 경계를 추가로 강제한다

#### Scenario: production 운영은 별도 승인임

- **WHEN** implementation, CI, 비운영 검증 또는 OpenSpec archive가 완료된다
- **THEN** production preflight, sync/apply, principal cutover 또는 live 검증 권한이 생기지 않는다
