## Why

GraphQL 사용자 데이터 권한을 application policy가 소유하기로 확정하면서, RLS를 위해 추가한 operation별 DB connection과 actor session state는 더 이상 권한을 강제하지 않으면서 lifecycle, Helm, 테스트와 장애 분석 비용만 남긴다. PROD-777과 PROD-778이 마지막 병합 RLS consumer를 제거했고 미병합 RLS PR도 닫혔으므로, GraphQL SQL을 process shared DB access 경계로 되돌리고 전용 기반을 제거한다.

## What Changes

- **BREAKING** GraphQL Query/Mutation별 postgres.js client, actor GUC 초기화와 cleanup plugin을 제거하고 GraphQL SQL이 process shared DB access 경계를 사용하게 한다.
- GraphQL HTTP JSON array batching과 별도 operation context clone을 제거한다. request마다 하나의 operation이 인증된 request identity와 request-scoped DataLoader context를 직접 사용하며, `selectProfile` 변경은 같은 Mutation의 이후 직렬 top-level field에 반영하고 다음 request에서 저장된 선택을 다시 인증한다.
- `OPERATION_DATABASE_URL`, API Helm env와 operation 전용 database factory를 제거한다.
- 현재 schema/policy에 actor helper consumer가 없음을 확인한 뒤 `public.kosmo_current_account_id()`와 `public.kosmo_current_profile_id()`를 forward migration으로 제거한다.
- GraphQL application이 전용 CloudNativePG PgBouncer Pooler를 더 이상 소비하지 않게 하되 기존 Pooler manifest, values와 리소스 lifecycle은 유지한다. API, Web, Worker, Fedify consumer와 migration의 기존 direct PostgreSQL `PG*` 경계도 변경하지 않는다.
- obsolete active `activate-graphql-operation-db-sessions` change는 미완료 live task와 과거 incident 기록을 보존한 history-only archive로 종료하고 canonical spec에 sync하지 않는다. 따라서 active delta의 `graphql-operation-db-session` capability도 canonical capability로 생성하지 않는다.
- application visibility/owner policy, GraphQL schema·payload·pagination, domain transaction·savepoint·post-commit, Worker/Fedify/Temporal lifecycle은 변경하지 않는다.
- production preflight, sync, apply, cutover와 live verification은 수행하지 않으며 별도 승인을 요구한다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`
- Historical Reference: `docs/operations/postgres-session-pool.md`
- Linear Contract: PROD-779
- Parent Decision: PROD-776
- Linear Implementations: PROD-779; prerequisites PROD-777, PROD-778; follow-up PROD-780

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `api-platform`: HTTP request당 단일 operation 실행 계약으로 정렬하고 operation별 DB handle 및 context snapshot 요구사항을 제거하면서 GraphQL application SQL을 process shared DB access 경계로 정렬한다.
- `rls-actor-context`: 남은 RLS consumer가 없는 Account/Profile actor GUC helper 계약을 retire한다.

## Impact

- `apps/api`: GraphQL HTTP batching 설정, operation context factory, execution plugin, context type, resolver/loader/core action DB handle 전달과 관련 unit/integration test
- `packages/core`: operation database owner/factory와 actor helper 제거 migration
- `apps/helm`: API `OPERATION_DATABASE_URL`과 관련 render assertions; 기존 Pooler template/values는 유지
- `README.md`: 완료된 operation URL 전환 문구 제거
- `openspec/specs`: `api-platform` shared DB 경계 정렬과 `rls-actor-context` capability 제거; `postgres-session-pool` capability 유지
- `openspec/changes/activate-graphql-operation-db-sessions`: superseded history-only archive
- 제외: Pooler resource 제거·재설계, application policy helper, runtime role 통합(PROD-780), migration owner, Fedify queue, Worker/Fedify/Temporal/Post policy, production 환경 변경
