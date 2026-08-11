## Why

Web trusted federation ingress의 Post/PostContent SQL은 현재 전역 owner database connection을 암묵적으로 사용해, 후속 Worker credential 전환이 SQL 호출부 변경과 결합된다. 실제 inbound ActivityPub 경로에 최소한의 명시적 database execution 경계를 도입해 현재 owner 동작을 유지하면서 credential source만 독립적으로 교체할 수 있게 한다.

## What Changes

- Web trusted federation ingress가 요청마다 현재 owner `DATABASE_URL` connection을 명시적 database handle로 전달한다.
- inbound ActivityPub의 Post/PostContent core service와 직접 SQL 호출부가 전달받은 handle 안에서 transaction과 savepoint 의미를 유지한다.
- 요청 실행과 connection lifetime을 함께 관리하고 성공, 오류와 rollback 뒤 resource cleanup을 검증한다.
- API/Web BFF 기본 database connection, GraphQL operation session, SQL 결과와 post-commit 동작은 변경하지 않는다.
- Worker role, Vault/Secret/GRANT/Helm credential selector, Temporal Workflow/Activity, Fedify MessageQueue와 production cutover는 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: `PROD-710`
- Linear Implementations: `PROD-710`

## Capabilities

### New Capabilities

- `trusted-federation-post-db-execution`: Web trusted federation ingress의 Post/PostContent SQL과 connection lifetime을 명시적 database handle에 결속하는 계약.

### Modified Capabilities

없음.

## Impact

- `packages/core`: Post 계열 service가 선택한 `DatabaseHandle`을 사용하도록 명시적 입력을 확장한다.
- `packages/fedify`: inbound dispatcher/listener context와 Post/PostContent SQL callsite가 같은 handle을 전달받는다.
- `apps/web`: federation ingress 요청에서 현재 owner database connection의 lifetime을 열고 닫는다.
- 외부 ActivityPub/GraphQL API, database schema, runtime credential과 배포 설정에는 변화가 없다.
