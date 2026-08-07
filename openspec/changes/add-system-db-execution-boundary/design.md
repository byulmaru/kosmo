## Context

현재 `packages/core/db`는 process-wide Drizzle `db`, `Database`, `Transaction`과 `getDatabaseConnection(tx?)`를 제공한다. 일부 core service는 optional caller transaction을 선택하지만 타입상 별도 database handle을 받을 수 없고, 다른 system SQL은 여전히 전역 DB를 직접 사용한다. production federation은 `Federation<void>`이며 web BFF는 `contextData: undefined`로 호출하므로 system 작업이 사용할 DB 경계가 호출 그래프에 드러나지 않는다.

PROD-706은 이 기반만 additive하게 배포한다. 기존 owner credential과 SQL 결과를 유지하고, 실제 Post system SQL 이전은 downstream PROD-710이 맡는다. GraphQL operation DB context는 PROD-708, 역할별 credential과 전환은 PROD-709/715, RLS policy·grant는 별도 이슈가 소유한다.

## Goals / Non-Goals

**Goals:**

- database와 transaction을 하나의 명시적 handle 계약으로 전달한다.
- system execution context를 API viewer context와 분리한다.
- system action이 전달 handle에서 transaction을 열고 종료·오류·rollback과 pool 반환을 소유한다.
- 기존 core caller의 optional transaction과 전역 owner DB fallback을 유지한다.
- context 격리와 transaction 수명을 DB-backed 테스트로 증명한다.

**Non-Goals:**

- Post/Profile/Media/Notification 등 production SQL callsite 전면 이전
- GraphQL `ctx.db` 또는 viewer actor setting 구현
- credential, role, RLS policy·grant, schema migration 변경
- post-commit lifecycle, ActivityPub 표현 또는 도메인 행동 변경

## Implementation Guidance

### Current Constraints

- Drizzle의 top-level database와 transaction은 모두 `.transaction()`을 제공하므로 caller transaction에 합류할 때 savepoint가 열린다. 이 합성 동작은 유지해야 한다.
- federation 전체 fetch를 하나의 transaction으로 감싸면 현재 미이전 전역 SQL과 별개인 idle transaction을 만들고, 향후 이전 시 handler 내부 post-commit effect가 outer commit 전에 실행될 위험이 있다.
- system context에 raw postgres client, credential 또는 role flag를 넣으면 범용 owner/BYPASSRLS escape hatch가 된다.
- 기존 Fedify 테스트는 `contextData: undefined`를 널리 사용하므로 production 조립 경계와 저수준 fixture 호환을 구분해야 한다.

### Recommended Approach

`packages/core/db`에 top-level database와 transaction을 포괄하는 `DatabaseHandle`을 추가하고 `getDatabaseConnection`이 optional handle을 선택하게 한다. 이미 optional transaction을 받는 공유 core service의 입력 타입은 이 handle로 additive하게 넓히되, 인자 생략 시 현재 singleton owner DB를 그대로 선택한다.

Fedify package에는 per-execution object인 system context와 factory를 trusted runtime 내부 구현으로 둔다. context는 오직 `readonly db: DatabaseHandle` 참조만 보유하고 기본값은 현재 owner `db`다. `readonly`는 handle 참조의 재할당을 막을 뿐 DML·transaction capability를 제한하지 않는다. 별도 system action helper는 전달 context의 handle에서 transaction을 열어 callback에는 transaction handle을 가진 좁은 action context를 넘긴다. federation 전체 fetch를 transaction으로 감싸지 않고, action별 transaction이 반환된 뒤 기존 post-commit effect가 실행될 수 있게 한다.

web BFF는 공개 context factory를 직접 import하지 않고 Fedify의 trusted runtime adapter를 호출한다. adapter가 federation 호출마다 새 system context object를 만들어 context data로 전달한다. 이번 change에서 handler SQL은 그 handle로 이전하지 않으며, downstream PROD-710이 필요한 production Post callsite에서 action helper와 context handle을 소비한다. 현재 별도 background worker entry는 없으므로 가상의 callsite를 만들지 않고, background/notification action은 같은 내부 execution helper를 재사용할 수 있는 계약만 제공한다.

실제 PostgreSQL 테스트는 성공 commit, thrown error rollback, caller transaction savepoint 합성, 반복 성공·실패 뒤 후속 transaction 성공과 요청별 context identity를 검증한다. web 조립 테스트는 federation에 매 호출 새 context가 전달되면서 기존 fallback 응답이 유지되는지 확인한다.

### Allowed Alternatives

- factory와 action runner의 구체 이름·파일 배치는 specs와 decisions의 경계, package dependency 방향과 export 계약을 유지하면 달라질 수 있다.
- system action helper는 context 객체 전체 또는 DB handle을 받을 수 있지만 callback에는 명시적 transaction handle이 전달되어야 하고 API viewer context에 노출되어서는 안 된다.

### Known Traps

- federation fetch 전체에 long-lived transaction을 열어 post-commit effect를 outer commit 안으로 이동하지 않는다.
- system context에 credential 문자열, role selector, raw pool client나 BYPASSRLS/owner fallback flag를 추가하지 않는다.
- system context factory를 package root에 export하거나 API context/import surface에 노출하지 않는다.
- PROD-710의 Post system SQL callsite를 이 change에서 `context.data.db`로 이전하지 않는다.
- 기존 전역 DB fallback을 제거하거나 global-only service 전체를 기계적으로 이전하지 않는다.

## Risks / Trade-offs

- [명시적 context가 배포되지만 이번 change에서는 대부분의 SQL이 아직 사용하지 않음] → PROD-710을 명시적 downstream blocker로 유지하고 이번 PR은 seam과 수명 검증만 소유한다.
- [DatabaseHandle union이 caller transaction과 top-level database를 혼동하게 할 수 있음] → 이름에서 transaction이 아닌 handle임을 드러내고 action callback은 transaction 전용 context로 좁힌다.
- [빈 system context 객체가 요청 사이에서 공유될 수 있음] → factory가 매 execution 새 객체를 반환하고 web 조립 테스트로 identity 격리를 검증한다.

## Migration Plan

1. handle 타입, core 선택 helper, system context/action runner와 테스트를 배포한다.
2. web/federation은 매 invocation context를 전달하지만 기존 owner credential과 미이전 전역 SQL을 유지한다.
3. PROD-710이 Post system SQL을 명시적 handle로 별도 이전한다.
4. 문제가 있으면 코드만 rollback한다. schema, Secret, role 또는 data rollback은 필요 없다.

## Open Questions

없음. 구현 전 Gate 검토에서 factory의 trusted runtime 비노출, 현재 web/federation production entry 범위와 `readonly db`의 참조 불변 의미를 확정했다.
