## 1. PROD-779 GraphQL operation DB lifecycle 제거

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- Linear PROD-776
- Linear PROD-779

**Deliverable**

GraphQL Query/Mutation이 operation별 database client나 actor GUC 없이 process shared DB access를 사용하고, HTTP request마다 하나의 operation이 인증된 request context와 request-scoped DataLoader를 직접 사용한다.

**Guardrails**

- GraphQL operation별 connection, actor setting, `ctx.db`와 `OPERATION_DATABASE_URL` compatibility seam을 남기지 않는다.
- GraphQL HTTP JSON array batching과 별도 operation context clone을 함께 제거하며 array body를 여러 operation의 batch로 실행하지 않는다.
- 같은 Mutation의 selected Profile 전환은 request context를 갱신해 이후 직렬 top-level field에 반영하고, 다음 HTTP request는 저장된 선택을 다시 인증한다.
- 공용 process `db`, Core `DatabaseHandle`, caller transaction과 `getDatabaseConnection` 경계는 제거하지 않는다.
- application role/Secret 통합은 PROD-780 범위로 남긴다.

**Verification**

- production source 정적 검색에서 operation database owner/plugin, actor setting, `ctx.db`와 `OPERATION_DATABASE_URL` consumer가 없음을 확인한다.
- GraphQL context unit/integration에서 array body가 batch로 실행되지 않고 단일 operation이 request context를 직접 사용하며, `selectProfile` 이후 같은 Mutation은 새 Profile을 사용하고 다음 request는 저장된 선택을 재인증하며 operation database owner가 생성되지 않음을 확인한다.
- API/Core typecheck, unit과 integration 검증을 통과시킨다.

- [x] 1.1 반대 방향의 `activate-graphql-operation-db-sessions` change를 canonical spec sync 없이 현재 task/incident history를 보존해 archive한다.
- [x] 1.2 GraphQL HTTP JSON array batching과 별도 operation context factory를 제거하고 request context를 단일 operation에 직접 전달한다.
- [x] 1.3 GraphQL operation별 database lifecycle과 actor initialization을 제거한다.
- [x] 1.4 Core의 operation 전용 database owner/factory만 제거하고 process shared DB 및 공용 handle/transaction contract를 유지한다.
- [x] 1.5 lifecycle/GUC/DB identity 및 batch sibling 격리 전용 assertion을 제거하고 단일-operation request context와 selected Profile 전환 회귀로 갱신한다.

## 2. PROD-779 GraphQL SQL consumer shared DB 정렬

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- Linear PROD-776
- Linear PROD-779

**Deliverable**

GraphQL Node, list, field, loader와 mutation/core action이 process shared DB access를 사용하면서 기존 application 권한, 결과와 transaction/post-commit 행동을 유지한다.

**Guardrails**

- Post visibility/owner/interaction, Bookmark owner와 Profile/Follow/Notification access predicate를 변경하거나 resolver마다 재구현하지 않는다.
- hidden/deleted Post owner cleanup, 기존 mutation payload, Notification cleanup과 viewer-independent Reaction count를 유지한다.
- domain transaction, caller-owned transaction, savepoint와 awaited post-commit 순서를 변경하지 않는다.
- Worker/Fedify/Temporal/Post policy와 GraphQL schema·목록 후보·정렬·pagination을 변경하지 않는다.

**Verification**

- Post/Repost/Bookmark/Reaction/Notification/Profile/Follow/Session/Media/Hashtag/Feedback GraphQL 회귀에서 기존 성공·권한·visibility·payload 결과를 확인한다.
- hidden/deleted owner cleanup, Notification cleanup 실패 격리, viewer-independent Reaction count와 Bookmark nullable Target Post 회귀를 확인한다.
- Core service transaction/savepoint/post-commit 회귀와 전체 API typecheck/lint를 통과시킨다.

- [x] 2.1 GraphQL read resolver와 loader가 context DB seam 없이 shared DB access와 기존 centralized policy를 사용하게 한다.
- [x] 2.2 GraphQL mutation과 core action 호출을 shared DB access로 정렬하고 기존 transaction/savepoint/post-commit 의미를 유지한다.
- [x] 2.3 selected Profile 전환에서 actor GUC 갱신만 제거하고 Session update transaction, 권한 검사와 성공 후 request context identity 갱신을 유지한다.
- [x] 2.4 domain별 GraphQL/Core 회귀를 갱신하고 제거 범위 밖의 결과가 변하지 않음을 검증한다.

## 3. PROD-779 actor helper forward migration

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- `memory/database-migrations.md`
- Linear PROD-779

**Deliverable**

남은 schema/policy consumer가 없는 Account/Profile actor helper가 immutable migration history를 유지한 새 forward migration으로 제거된다.

**Guardrails**

- 이미 적용된 migration directory name, SQL, hash와 snapshot을 수정하거나 재생성하지 않는다.
- 다른 function, policy, table RLS, object ownership/ACL이나 runtime role을 변경하지 않는다.
- 파일별 migration behavior test를 추가하지 않는다.
- production migration apply는 수행하지 않는다.

**Verification**

- 현재 schema와 production source에서 두 helper의 허용되지 않은 consumer가 없음을 확인한다.
- disposable DB 전체 migration replay와 catalog query에서 migration history가 유효하고 두 helper가 없으며 unrelated schema가 유지됨을 확인한다.
- generic migration unit/smoke와 `git diff --check`를 통과시킨다.

- [x] 3.1 actor helper dependency와 호출 인벤토리를 확정하고 immutable history/archived reference를 runtime consumer와 구분한다.
- [x] 3.2 별도 forward migration으로 Account/Profile actor helper만 제거한다.
- [x] 3.3 disposable migration replay, catalog와 generic migration 검증으로 제거 결과와 unrelated schema 불변을 확인한다.

## 4. PROD-779 Helm·문서·OpenSpec closeout

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- Linear PROD-776
- Linear PROD-779

**Deliverable**

API Helm과 문서는 GraphQL operation URL을 소비하지 않는 shared `PG*` 경계를 표현하고, 기존 Pooler resource와 다른 workload DB 경계를 유지하며 OpenSpec이 현재 canonical 계약에 sync/archive된다.

**Guardrails**

- 기존 Pooler template, values, CR/resource와 historical 운영 기록을 제거하거나 재설계하지 않는다.
- API/Web/Worker/Fedify consumer와 migration의 표준 `PG*`, Secret ref, migration owner와 Fedify queue 경계를 변경하지 않는다.
- dev/production preflight, sync, apply, prune, cutover와 live verification을 수행하지 않는다.
- `rls-actor-context` capability는 제거하되 `postgres-session-pool` capability는 유지한다.

**Verification**

- Kubernetes/Argo/live에 접근하지 않는 로컬 dev/prod 정적 Helm lint/render에서 API `OPERATION_DATABASE_URL`이 없고 기존 Pooler resource/values와 workload `PG*`/Secret ref가 유지됨을 확인한다.
- README/canonical docs/OpenSpec에서 current target과 historical 기록이 충돌하지 않는지 확인한다.
- Prettier, ESLint, TypeScript, 전체 OpenSpec strict validation과 관련 test suite를 통과시킨다.
- Ready PR의 head/check/review 상태를 확인하고 production 작업 미수행 경계를 PR/Linear에 기록한다.

- [x] 4.1 API operation URL wiring과 current documentation reference를 제거하고 기존 Pooler 및 다른 workload render를 보존한다.
- [x] 4.2 `api-platform` delta를 canonical spec에 sync하고 retired `rls-actor-context` canonical 파일을 빈 stub 없이 제거한 뒤 새 change를 archive한다.
- [x] 4.3 전체 정적·GraphQL/Core·migration·Helm·OpenSpec 검증과 correctness/minimality self-review를 완료한다.
- [x] 4.4 구현·검증·결정·제외 범위와 production 미수행 경계를 기록한 Ready PR을 게시하고 리뷰 thread를 정리한다.
