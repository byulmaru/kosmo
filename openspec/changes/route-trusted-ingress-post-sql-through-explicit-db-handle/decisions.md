## Context

이 기록은 PROD-710의 Web trusted federation ingress Post/PostContent SQL 실행 경계와 최초 owner connection 유지 계약을 반영한다. canonical Post/ActivityPub 결과는 유지하고 credential principal 전환은 PROD-715에 남긴다.

## Decision Records

### 실제 Post SQL과 함께 최소 explicit handle seam을 도입한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, Linear `PROD-710`
- Status: Active
- Context / Problem: 미래 consumer 없이 범용 실행 경계만 추가하면 독립 capability의 완료 증거가 없지만, 전역 DB를 사용하는 현재 production ingress SQL은 후속 credential 전환과 callsite 변경을 결합한다.
- Decision Outcome: Web trusted federation ingress의 실제 Post/PostContent SQL callsite 이전과 그에 필요한 최소 `DatabaseHandle`/context/lifetime seam을 하나의 change에서 구현한다.
- Alternatives Considered: 범용 system context를 먼저 추가하는 방안은 실제 consumer 없는 YAGNI이며, credential 전환과 함께 구현하는 방안은 rollback과 principal 변경을 결합하므로 채택하지 않았다.
- Consequences: Post와 무관한 Fedify SQL, Temporal domain activity와 credential source는 이 seam의 범위가 아니다.
- Integration Constraint: 공유 federation에는 database context를 항상 명시한다. PROD-448 queue consumer는 기존 전역 owner `db`를 명시적으로 전달할 뿐 queue credential, SQL과 lifetime은 변경하지 않으며 Web trusted ingress만 request database와 cleanup lifetime을 소유한다.
- Confirmation / Follow-up: production Post/PostContent import/callsite inventory와 explicit handle 회귀 테스트로 확인한다.

### 최초 handle source는 기존 owner DATABASE_URL을 사용한다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-710`
- Status: Active
- Context / Problem: execution boundary와 database principal을 동시에 바꾸면 SQL 회귀와 권한/credential 문제를 분리해 rollback할 수 없다.
- Decision Outcome: PROD-710의 request database는 기존 `DATABASE_URL` owner source로 만들고 principal 전환을 주장하지 않는다. PROD-715가 이후 같은 생성 seam의 source만 `WORKER_DATABASE_*`로 교체한다.
- Alternatives Considered: 지금 Worker credential을 읽는 방안은 PROD-715를 선점하고, 전역 pool을 그대로 context에 넣는 방안은 명시적 connection lifetime과 cleanup 완료 기준을 만족하지 않으므로 채택하지 않았다.
- Consequences: 이번 change는 role, Secret, GRANT, Helm이나 production cutover를 포함하지 않으며 DB 결과는 기존 owner 권한으로 유지된다.
- Confirmation / Follow-up: 테스트에서 기본 source가 `DATABASE_URL`인지 확인하고 PR에 principal 미전환을 명시한다.

### Action transaction과 request database lifetime을 분리한다

- Decision Date: 2026-08-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, Linear `PROD-710`
- Status: Active
- Context / Problem: Post action은 caller-owned transaction에 합류해야 하지만 post-commit SQL과 request cleanup은 transaction commit 이후까지 살아 있는 `Database`가 필요하다.
- Decision Outcome: core action 입력은 `DatabaseHandle = Database | Transaction`을 유지하고, inbound outer transaction 안에서는 같은 `Transaction`을 lookup/direct SQL/action에 전달한다. post-commit callback은 outer commit 뒤 request `Database`로 실행하며 Web은 전체 federation request가 끝난 뒤 해당 database를 닫는다.
- Alternatives Considered: transaction을 post-commit callback이나 Web context lifetime 밖으로 전달하는 방안은 commit 이후 유효하지 않고, core action이 별도 전역 transaction을 열게 두는 방안은 원자성과 principal 경계를 분리하므로 채택하지 않았다.
- Consequences: 테스트는 success/rollback/savepoint뿐 아니라 post-commit ordering과 success/error close를 검증해야 한다.
- Confirmation / Follow-up: DB-backed Fedify 테스트와 Web adapter 단위 테스트로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
