## Context

이 기록은 PROD-778과 ADR 0024가 정한 Bookmark RLS 철회, selected Profile 기반 application owner
boundary, hidden/deleted Target Post 관계 보존과 compensating migration 경계를 구현 가능한 선택으로
구체화한다. Bookmark GraphQL 계약은 보존하며, 다른 table 정책과 operation session·actor GUC·runtime role
통합 및 production 운영은 독립 slice에 남긴다.

## Decision Records

### Bookmark owner authorization은 application policy가 소유한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`, PROD-778
- Status: Active
- Context / Problem: Bookmark owner 조건이 GraphQL application predicate와 PostgreSQL RLS에 중복되어 요청별 SNS policy와 DB session actor state가 결합됐다.
- Decision Outcome: Bookmark의 selected Profile owner authorization은 기존 GraphQL selector/loader/service/application action의 predicate로 유지한다. 권한 판정 결과는 PostgreSQL Bookmark RLS 또는 actor GUC에 의존하지 않는다. 현재 operation session 제거는 PROD-779에서 수행한다.
- Alternatives Considered: `kosmo_api` RLS와 application predicate를 계속 중복하는 방식은 ADR 0024의 application-policy 경계와 중복 enforcement 비용을 유지하므로 선택하지 않는다. application predicate까지 제거하는 방식은 Bookmark.Owner 계약을 깨뜨리므로 선택하지 않는다.
- Consequences: GraphQL Node, connection, viewer, create/delete 경로는 selected Profile owner 조건을 계속 명시해야 하며, 후속 operation session 제거는 이 change의 전제나 완료 증거가 아니다.
- Confirmation / Follow-up: 기존 Bookmark GraphQL integration에서 owner/other Profile과 create/delete/Node/connection/viewer 결과를 검증한다.

### 병합된 Bookmark RLS는 기존 history를 수정하지 않는 forward migration으로 제거한다

- Decision Date: 2026-08-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, PROD-778
- Status: Active
- Context / Problem: Bookmark RLS migration은 이미 main에 병합되어 기존 migration 파일을 편집하거나 삭제하면 신규·기존 schema의 history가 갈라진다.
- Decision Outcome: Bookmark schema metadata와 target snapshot을 RLS 없는 상태로 정렬하고, 적용된 RLS enablement/policy를 제거하는 새 compensating forward migration을 추가한다. 이 migration은 Bookmark scope만 다룬다.
- Alternatives Considered: 이전 migration 수정·삭제는 migration lineage를 깨뜨리므로 선택하지 않는다. policy만 제거하거나 RLS만 비활성화하는 부분 rollback은 최종 catalog 계약을 모호하게 하므로 선택하지 않는다.
- Consequences: 빈 schema replay와 이미 Bookmark RLS가 적용된 비운영 schema 모두 같은 최종 Bookmark catalog에 도달해야 한다. migration 자체의 production apply는 별도 승인 없이는 수행하지 않는다.
- Confirmation / Follow-up: migration replay와 schema/catalog check에서 Bookmark RLS disabled 및 Bookmark policy absent를 확인하고 다른 table policy 변경이 없음을 확인한다.

### Bookmark row 권한과 Target Post 노출은 분리한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/bookmark.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-778
- Status: Active
- Context / Problem: Target Post visibility/lifecycle을 Bookmark owner row predicate에 결합하면 hidden 또는 Tombstone Target에서 Owner의 Bookmark Node와 delete 결과를 잃는다.
- Decision Outcome: Owner application predicate는 Bookmark row의 Profile 소유권만 판정한다. Target Post 조회 가능성은 `Bookmark.post` nullable field와 `Profile.bookmarks` edge 후보에서 기존 Post policy로 독립 적용하며, hidden/deleted Target의 row 유지·owner delete·`DELETE RETURNING` 계약을 보존한다.
- Alternatives Considered: Bookmark owner predicate에 Post visibility/lifecycle을 추가하는 방식은 canonical Bookmark 생명주기와 hidden Target 계약을 깨뜨리므로 선택하지 않는다.
- Consequences: Node와 delete payload는 row를 보존할 수 있고 Post field는 null이 될 수 있으며 owner connection은 hidden Target edge를 제외할 수 있다. physical Post deletion cleanup은 기존 domain FK/lifecycle 계약을 따른다.
- Confirmation / Follow-up: hidden/Tombstone/unavailable Target integration과 repeated delete payload를 검증한다.

### PROD-778은 Bookmark 정책과 비운영 증거만 소유한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, PROD-778
- Status: Active
- Context / Problem: Bookmark RLS 철회와 operation session·role 통합 또는 production cutover를 하나의 PR에 결합하면 독립적인 rollout과 승인 경계가 사라진다.
- Decision Outcome: PROD-778은 Bookmark metadata/migration/snapshot, 기존 GraphQL regression, generic migration/catalog 검증과 OpenSpec sync/archive를 소유한다. Post/PostContent 및 다른 table RLS, Worker/Fedify/Temporal, operation session/`ctx.db`/actor GUC, runtime role/ACL/credential과 production preflight/sync/apply/cutover/live는 포함하지 않는다.
- Alternatives Considered: 후속 operation/runtime 작업을 이번 change에 포함하는 방식은 PROD-779/780의 독립 계약과 승인을 선점하므로 선택하지 않는다.
- Consequences: 이 change가 완료되어도 operation session 제거나 runtime role 통합, production activation을 의미하지 않는다.
- Confirmation / Follow-up: diff scope, CI와 비운영 검증 증거를 확인하고 OpenSpec archive 시 후속 이슈 handoff를 명시한다.

### 이전 Bookmark GraphQL RLS enforcement 계약은 application-policy target으로 대체한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/bookmark.md`, PROD-778; superseded historical implementation: PROD-771 and `openspec/changes/archive/2026-08-14-apply-bookmark-graphql-owner-rls/`
- Status: Superseded
- Context / Problem: PROD-771과 archived `apply-bookmark-graphql-owner-rls`는 `kosmo_api` Bookmark SELECT/INSERT/DELETE RLS와 actor helper를 요구했으나, 현재 Domain 결정은 GraphQL SNS 권한을 application policy에 두도록 변경됐다.
- Decision Outcome: 이전 RLS requirement와 그 구현 선택은 Bookmark application owner predicate·hidden Target 보존·compensating migration target으로 대체한다. archived change와 historical migration은 감사·재현 history로 보존하고 수정하지 않는다.
- Alternatives Considered: archived RLS contract를 계속 active target으로 유지하면 현재 ADR 0024와 충돌하므로 선택하지 않는다. history 자체를 삭제하거나 rewrite하면 과거 적용 사실과 migration lineage가 사라지므로 선택하지 않는다.
- Consequences: active `bookmark-graphql-row-level-security` spec은 이 change의 delta를 통해 네 RLS requirement를 모두 제거·supersede하고, `bookmark` spec delta가 target application policy와 기존 GraphQL behavior를 소유한다.
- Confirmation / Follow-up: strict validation과 archive 후 active spec delta가 RLS requirement를 남기지 않는지, archived history가 그대로 남는지 확인한다.

## Remaining Decisions

없음.

## Superseded Decisions

- 위 `이전 Bookmark GraphQL RLS enforcement 계약은 application-policy target으로 대체한다` 기록이 PROD-771과 archived `apply-bookmark-graphql-owner-rls`의 RLS enforcement 선택을 대체한다.
