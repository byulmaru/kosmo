## Context

ADR 0024와 PROD-776은 GraphQL 가시성·owner 권한을 application policy가 소유하고 GraphQL SQL은 process shared DB access 경계를 사용하도록 확정했다. PROD-777과 PROD-778은 main에 병합된 마지막 Post/PostContent와 Bookmark RLS policy를 제거했고, Reaction/FollowRequest RLS PR은 merge 없이 닫혔다.

현재 runtime에는 이 결정과 반대인 기반이 남아 있다. GraphQL HTTP JSON array batching이 활성화돼 있고, 실행 준비 단계는 operation마다 request identity와 loader registry를 clone한다. 별도 실행 plugin은 Query/Mutation마다 `OPERATION_DATABASE_URL`로 postgres.js client를 만들고 Account/Profile GUC를 설정하며 context의 `db`를 교체한다. Resolver와 loader 약 55개는 `ctx.db`를 통해 SQL 또는 core action을 호출하고, `selectProfile`은 같은 session GUC와 operation snapshot을 갱신한다. 저장소의 GraphQL client는 request마다 하나의 operation object만 전송한다. Core DB 모듈은 closeable operation owner/factory를 제공하고 Helm API Rollout은 별도 operation URL을 주입한다. 반면 현재 schema에는 actor helper를 소비하는 RLS policy가 없으며, 기존 PgBouncer Pooler는 사용자의 결정에 따라 제거하지 않고 유지한다.

기존 active `activate-graphql-operation-db-sessions` change는 13/17 tasks 상태이고 남은 항목은 lifecycle 및 dev live gate다. 이는 현재 canonical 방향과 반대이므로 canonical spec에 sync하지 않는 history-only archive로 보존해야 한다.

## Goals / Non-Goals

**Goals:**

- GraphQL operation별 database client lifecycle과 actor GUC 설정을 제거한다.
- GraphQL HTTP JSON array batching과 별도 operation context clone을 함께 제거하고, request마다 하나의 operation이 인증된 request context와 request-scoped DataLoader를 직접 사용하게 한다. 같은 Mutation의 `selectProfile` 전환은 request context를 갱신해 이후 직렬 top-level field에 반영한다.
- GraphQL resolver/loader와 core action 호출을 process shared DB access 경계로 정렬한다.
- `OPERATION_DATABASE_URL` 소비와 operation database factory를 제거한다.
- 남은 schema dependency가 없는 actor helper 함수를 forward migration으로 제거한다.
- 기존 application policy, GraphQL 결과와 transaction/post-commit 의미를 회귀 검증한다.
- 기존 PgBouncer Pooler manifest/values/resource가 유지되고 application consumer만 사라짐을 Helm render로 확인한다.

**Non-Goals:**

- PgBouncer Pooler resource 제거·재설계, capacity·readiness·live 검증
- application visibility/owner/interaction policy 변경
- 표준 process `PG*` source나 runtime role/Secret 변경(PROD-780)
- Worker, Fedify, Temporal lifecycle과 Fedify queue/migration owner 경계 변경
- production preflight, sync, apply, cutover와 live verification

## Implementation Guidance

### Current Constraints

- `Context`의 `db` field와 `ctx.db` 사용이 resolver, loader, mutation 및 테스트에 넓게 퍼져 있어 plugin만 삭제하면 type/runtime 오류가 난다.
- 별도 operation context clone만 제거하고 JSON array batching을 유지하면 동시 sibling operation이 mutable session identity와 loader state를 공유할 수 있으므로 두 기능을 함께 제거해야 한다.
- Resolver-owned SQL은 shared `db`를 직접 사용하도록 바꿔야 하지만 core의 `DatabaseHandle`, optional caller transaction과 `getDatabaseConnection`은 GraphQL 외 caller와 domain transaction에 필요한 공용 경계이므로 제거 대상이 아니다.
- `selectProfile`은 Session row update와 request context의 in-memory identity 갱신 순서를 유지해야 한다. actor `set_config`만 제거하고 action-local transaction 자체를 없애면 안 되며, 같은 Mutation의 이후 직렬 top-level field는 새 Profile을 관찰해야 한다. 다음 HTTP request는 저장된 selected Profile을 인증 경계에서 다시 검증한다.
- actor helper는 Drizzle table snapshot이 아니라 과거 SQL migration으로 생성된 함수라서 table schema diff만으로 제거되지 않는다. 기존 migration을 수정하지 않고 새 forward migration이 필요하다.
- 두 actor helper를 호출하는 병합 policy는 없지만 과거 migration/snapshot 문자열은 immutable history이므로 정적 검색의 허용 목록에서 구분해야 한다.
- 기존 Pooler는 유지한다. Helm에서 제거할 것은 API `OPERATION_DATABASE_URL` env와 그 consumer assertion뿐이며 Pooler template, values와 운영 기록을 삭제하면 범위를 넘는다.

### Recommended Approach

1. obsolete active activation change를 현재 13/17 상태와 incident/live history 그대로 `--skip-specs` history-only archive한다.
2. GraphQL HTTP JSON array batching과 별도 operation context factory를 제거하고, request context를 단일 operation이 직접 사용하게 한다.
3. GraphQL operation-session plugin 등록과 구현, 전용 lifecycle test를 제거하고 core operation database owner/factory와 그 전용 test를 제거한다.
4. request `Context` type에서 `db`를 제거하고 resolver/loader의 entry-local SQL은 shared `db` import를 사용한다. Core action에는 기존 optional handle 계약에 맞춰 shared `db`를 전달하거나 불필요한 명시 인자를 생략하되, caller-owned transaction과 post-commit 호출 순서는 유지한다.
5. `selectProfile`에서 actor GUC update만 제거하고 Session update transaction과 성공 후 request context의 `ctx.session.profileId` 갱신을 유지한다.
6. API Helm env와 README/config reference에서 `OPERATION_DATABASE_URL`을 제거하되 Pooler manifest/values/resource는 그대로 둔다.
7. 새 forward migration에서 Account/Profile actor helper 함수를 제거하고 disposable migration replay/catalog 검증으로 dependency 부재와 migration history 정합성을 확인한다.
8. 단일-operation request context, 주요 GraphQL domain 회귀, Core transaction 회귀와 Helm lint/render를 통과시킨 뒤 delta spec을 sync하고 새 change를 archive한다.

### Allowed Alternatives

- Resolver마다 `db`를 import하는 대신 기존 core DB 모듈의 process shared handle을 반환하는 좁은 기존 accessor를 사용할 수 있다. 새 service locator, request container 또는 operation용 compatibility wrapper를 만들지 않고 specs의 shared access와 `ctx.db` 부재를 만족해야 한다.
- Core action의 optional handle은 shared `db`를 명시적으로 전달하거나 기존 default를 사용할 수 있다. transaction/post-commit 의미와 GraphQL 외 caller 경계를 바꾸지 않는 쪽을 파일별로 선택할 수 있다.

### Known Traps

- `ctx.db`를 global `db`로 기계 치환하면서 `tx` 안에서 실행돼야 하는 SQL이나 awaited post-commit을 transaction 밖으로 빼지 않는다.
- `Context.db`를 optional compatibility field로 남기거나 operation plugin을 no-op으로 유지하면 제거 계약과 정적 완료 조건을 충족하지 못한다.
- GUC helper 제거 migration을 기존 PROD-370 migration에 덮어쓰거나 이미 적용된 migration name/hash를 변경하지 않는다.
- 과거 migration/snapshot과 archived OpenSpec의 actor helper 문자열을 production call-site로 오판해 immutable history를 수정하지 않는다.
- `OPERATION_DATABASE_URL`을 direct Service로 바꾸어 operation client를 유지하지 않는다. 별도 lifecycle 자체가 제거 대상이다.
- Pooler가 사용되지 않는다는 이유로 template, values, CR 또는 운영 기록을 이번 범위에서 삭제하지 않는다.
- RLS 철회를 이유로 Post/Bookmark/Reaction/Notification application predicate나 Worker/Fedify/Temporal 코드를 단순화하지 않는다.

## Risks / Trade-offs

- [넓은 `ctx.db` 치환에서 transaction 또는 policy 인자가 누락될 수 있음] → typecheck와 domain별 GraphQL integration, Core service 회귀 및 targeted static search를 함께 사용한다.
- [actor helper drop이 숨은 database dependency로 실패할 수 있음] → 현재 schema/policy consumer를 정적으로 확인하고 disposable migration replay에서 실제 catalog dependency와 함수 부재를 검증한다.
- [저장소 밖의 미문서화된 caller가 JSON array batching에 의존할 수 있음] → 저장소 client가 단일 operation object만 전송함을 확인하고, array body가 batch로 실행되지 않는 API 회귀를 추가한다. 외부 호환 계약이 새로 확인되면 구현을 멈추고 Gate를 다시 연다.
- [사용하지 않는 Pooler 리소스 비용과 운영 surface가 남음] → 이번 결정대로 리소스는 유지하며, 재사용 또는 retirement 필요가 생기면 별도 canonical/Linear 경계에서 판단한다.
- [구버전 runtime과 새 migration의 동시 실행] → 구버전 plugin은 helper 함수를 호출하지 않고 GUC만 설정하며 병합 policy도 제거됐으므로 helper drop 뒤에도 SQL call graph가 유지되는지 disposable replay와 회귀로 확인한다.

## Migration Plan

1. source tree에서 HTTP JSON array batching, operation context clone, operation plugin/client, actor setting, `ctx.db`와 operation URL consumer를 제거한다.
2. actor helper 제거 forward migration을 추가한다. 기존 migration과 snapshot은 수정하지 않는다.
3. disposable DB에서 전체 migration replay와 catalog 검증을 실행한다. 파일별 migration behavior test는 추가하지 않는다.
4. API/GraphQL/Core/Helm 정적·회귀 검증과 OpenSpec strict validation을 통과시킨다.
5. Ready PR merge는 source 및 CI 완료만 의미한다. production preflight/sync/apply/cutover/live는 별도 승인을 받기 전 수행하지 않는다.

Rollback은 새 source revision을 Git revert하는 방식으로 준비한다. actor helper가 이미 적용된 환경에서 구 operation-session code로 되돌려야 하는 별도 배포 상황은 새 forward restore migration과 승인이 필요하며, 기존 applied migration을 수정하지 않는다. 현재 작업에서는 환경 apply나 rollback을 실행하지 않는다.

## Open Questions

없음. 기존 PgBouncer Pooler는 이번 변경에서 유지하며 GraphQL application consumer만 제거하기로 확정했다.
