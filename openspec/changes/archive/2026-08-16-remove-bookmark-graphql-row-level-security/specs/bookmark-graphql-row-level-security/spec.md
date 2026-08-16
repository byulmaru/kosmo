## REMOVED Requirements

### Requirement: Bookmark에 GraphQL principal RLS를 활성화한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/bookmark.md`, PROD-778 — This historical Bookmark RLS requirement MUST be removed from the active capability.

**Reason:** ADR 0024는 GraphQL 사용자 데이터의 요청별 가시성·owner business rule을 PostgreSQL RLS가 아니라
application policy가 소유하도록 결정했다. PROD-771에서 병합된 RLS requirement는 현재 target contract와
충돌하므로 active capability에서 제거한다.

**Migration:** 기존 migration history와 archived `apply-bookmark-graphql-owner-rls` 기록은 수정하지 않는다.
새 compensating forward migration으로 Bookmark RLS enablement와 RLS policy를 제거하고, target application
contract는 `openspec/changes/remove-bookmark-graphql-row-level-security/specs/bookmark/spec.md`에서 관리한다.

#### Scenario: 과거 Bookmark RLS 활성화 requirement가 active contract에서 제거됨

- **WHEN** 이 change의 active capability delta가 동기화되면
- **THEN** Bookmark에 GraphQL principal RLS를 활성화한다는 requirement는 더 이상 active contract가 아니다

### Requirement: selected Profile 기준 Bookmark owner policy를 강제한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/bookmark.md`, PROD-778 — This historical PostgreSQL selected Profile policy requirement MUST be removed from the active capability.

**Reason:** selected Profile owner boundary 자체는 제품 계약이지만 PostgreSQL `kosmo_api` policy와 actor
GUC로 중복 강제할 근거가 없다. 기존 application owner contract는 `bookmark` capability에서 별도로
소유하고, 이 RLS capability는 더 이상 application behavior를 정의하지 않는다.

**Migration:** `kosmo_api` Bookmark SELECT/INSERT/DELETE policy와 malformed/empty actor setting 기반 RLS
차단 요구사항을 새 target contract로 이식하지 않는다. application selected Profile owner enforcement는
`bookmark` delta와 canonical Bookmark 계약을 따른다.

#### Scenario: 과거 Bookmark PostgreSQL owner policy requirement가 active contract에서 제거됨

- **WHEN** 이 change의 active capability delta가 동기화되면
- **THEN** selected Profile을 `kosmo_api` PostgreSQL RLS policy로 강제한다는 requirement는 더 이상 active contract가 아니다

### Requirement: Bookmark row 권한과 Target Post 노출을 분리한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-778 — This historical RLS-specific row authorization requirement MUST be removed from the active capability.

**Reason:** row owner와 Target Post visibility를 분리하는 제품 동작은 canonical Bookmark 계약에 남지만,
이를 Bookmark RLS capability의 database predicate requirement로 유지하지 않는다. RLS 철회 뒤의 durable
application behavior는 `bookmark` capability가 소유한다.

**Migration:** hidden/deleted Target Post의 Owner row 유지, nullable `Bookmark.post`, connection edge 필터와
Owner delete 등 기존 제품 계약은 `bookmark` delta에서 보존한다. 이 old RLS capability에는 Post visibility
또는 lifecycle predicate를 남기지 않는다.

#### Scenario: 과거 Bookmark RLS row/Target predicate requirement가 active contract에서 제거됨

- **WHEN** 이 change의 active capability delta가 동기화되면
- **THEN** Bookmark row 권한과 Target Post 노출을 RLS predicate로 정의하는 requirement는 더 이상 active contract가 아니다

### Requirement: 기존 GraphQL owner 계약과 후속 운영 경계를 유지한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/bookmark.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-778 — This mixed RLS capability and downstream-operation requirement MUST be removed from the active capability.

**Reason:** Bookmark Node, connection, viewer relation, mutation payload와 hidden Target 동작은 기존 제품
계약으로 계속 유효하지만 RLS capability가 소유하지 않는다. operation session·`ctx.db`·actor GUC·runtime
role과 production 운영 경계도 별도 Linear slice의 책임이다.

**Migration:** 기존 Bookmark GraphQL owner·hidden Target·`DELETE RETURNING` 계약은 `bookmark` delta와
canonical 문서에서 유지한다. 이 capability에는 PostgreSQL RLS, operation session, runtime cutover 또는
production 완료 조건을 남기지 않으며, Bookmark Notification 동작은 이 change 범위에서 제외한다.

#### Scenario: 과거 RLS capability의 혼합 GraphQL/운영 requirement가 active contract에서 제거됨

- **WHEN** 이 change의 active capability delta가 동기화되면
- **THEN** GraphQL behavior와 downstream operation 경계는 이 old RLS capability가 아니라 각 canonical·target capability와 별도 Linear slice에서 소유한다
