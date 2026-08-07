## Context

현재 `packages/core/db`는 process-wide Drizzle `db`, `Database`, `Transaction`과 `getDatabaseConnection(tx?)`를 제공한다. production federation은 `Federation<void>`이며 Web BFF는 `contextData: undefined`로 호출하므로 Fedify 작업이 사용할 DB 경계가 호출 그래프에 드러나지 않는다. outbound delivery는 현재 API에서도 직접 호출되지만 목표 구조에서는 API가 durable intent만 기록하고 Temporal Worker Activity가 Fedify를 실행한다.

PROD-706은 Web inbound와 후속 Temporal Activity가 공유할 Fedify 전용 기반만 additive하게 배포한다. 기존 owner credential과 SQL 결과를 유지하고, 실제 Post Fedify SQL 이전은 PROD-710이 맡는다. Temporal Workflow/Activity와 Worker Deployment, GraphQL operation DB context, 역할별 credential과 RLS policy·grant는 각 후속 이슈에 남긴다.

## Goals / Non-Goals

**Goals:**

- database와 transaction을 하나의 명시적 handle 계약으로 전달한다.
- Fedify execution context를 API viewer context와 분리한다.
- Fedify action이 전달 handle에서 transaction을 열고 종료·오류·rollback과 pool 반환을 소유한다.
- Web inbound adapter와 미래 Temporal Activity가 같은 package-internal 경계를 사용할 수 있게 한다.
- 기존 caller transaction과 전역 owner DB fallback을 유지한다.

**Non-Goals:**

- notification/background를 포함하는 범용 system execution abstraction
- API가 outbound Fedify를 직접 실행하는 새 공개 seam
- Temporal Workflow/Activity 또는 Worker Deployment 구현
- Post를 포함한 production SQL callsite 이전
- credential, role, RLS policy·grant, schema와 제품 행동 변경

## Implementation Guidance

### Current Constraints

- Drizzle top-level database와 transaction은 모두 `.transaction()`을 제공하므로 caller transaction에 합류할 때 savepoint가 열린다.
- federation fetch 전체를 transaction으로 감싸면 아직 전역 DB를 쓰는 SQL과 무관한 idle transaction과 잘못된 post-commit 시점이 생긴다.
- Fedify context에 raw postgres client, credential 또는 role flag를 넣으면 owner/BYPASSRLS escape hatch가 된다.
- 기존 저수준 Fedify fixture는 `contextData: undefined`를 사용하므로 production Web adapter와 fixture 경계를 구분해야 한다.
- 현재 Temporal Activity entry는 없으므로 가상의 worker callsite를 만들 수 없다.

### Recommended Approach

`packages/core/db`에 top-level database와 transaction을 포괄하는 `DatabaseHandle`을 추가하고 `getDatabaseConnection`이 optional handle을 선택하게 한다. 이 change에서 core service widening은 Fedify Post downstream이 소비할 기존 optional transaction seam으로 제한하며, Fedify와 무관한 Bookmark, Session, local Reaction/Profile update seam은 변경하지 않는다.

Fedify package에는 per-invocation `FedifyExecutionContext`와 factory를 package-internal 구현으로 둔다. context는 `readonly db: DatabaseHandle`만 보유하고 기본값은 현재 owner `db`다. 별도 Fedify action helper는 전달 context의 handle에서 transaction을 열어 callback에 transaction handle을 전달한다. federation fetch 전체에는 transaction을 열지 않는다.

Web BFF는 context factory를 직접 import하지 않고 package root의 inbound `fetchFederation` adapter를 호출한다. adapter가 invocation마다 새 Fedify context object를 만든다. factory와 action runner는 package root/API surface에 export하지 않는다. 후속 Temporal Activity는 Fedify package 안의 전용 Activity adapter에서 같은 내부 context 경계를 사용하며, API에는 context 생성이나 직접 delivery seam을 노출하지 않는다.

이번 change에서 handler SQL은 context handle로 이전하지 않는다. PROD-710이 Post Fedify callsite에서 정확한 transaction과 post-commit 조립 위치를 선택한다. PostgreSQL 테스트는 success commit, error rollback, caller transaction savepoint, 반복 실행 뒤 pool 사용 가능성과 context identity를 검증한다.

### Allowed Alternatives

- factory와 action runner의 구체 파일 배치는 package-internal 비노출과 Fedify 전용 명명 계약을 유지하면 달라질 수 있다.
- 후속 Temporal Activity adapter의 구체 export는 Activity 구현 이슈가 결정하지만 API viewer/public factory를 추가할 수는 없다.

### Known Traps

- Fedify 경계를 `system`, notification 또는 background abstraction으로 일반화하지 않는다.
- federation fetch 전체에 long-lived transaction을 열지 않는다.
- context에 credential, role selector, raw pool client나 BYPASSRLS/owner flag를 추가하지 않는다.
- context factory와 action runner를 package root 또는 API context에 export하지 않는다.
- PROD-710의 Post Fedify SQL callsite를 이 change에서 이전하지 않는다.
- API의 현재 direct outbound delivery를 이 change에서 durable intent/Temporal로 전환하지 않는다.

## Risks / Trade-offs

- [명시적 context가 배포되지만 SQL은 아직 사용하지 않음] → PROD-710을 blocker로 유지하고 이번 PR은 Fedify seam과 수명 검증만 소유한다.
- [미래 Temporal Activity callsite가 아직 없음] → 가상 worker를 만들지 않고 package-internal context와 action runner의 재사용 가능성만 타입·테스트로 보장한다.
- [저수준 federation fixture는 void context를 유지함] → production Web adapter에서만 매 invocation context 전달을 강제하고 downstream SQL 이전 시 handler 타입을 좁힌다.

## Migration Plan

1. DatabaseHandle, Fedify context/action runner와 Web inbound adapter를 배포한다.
2. Web inbound는 매 invocation context를 전달하지만 기존 owner credential과 미이전 SQL을 유지한다.
3. 후속 Temporal 이슈가 outbound Activity adapter를 만들고 PROD-710이 Post Fedify SQL을 명시적 handle로 이전한다.
4. 문제 시 코드만 rollback한다. schema, Secret, role 또는 data rollback은 필요 없다.

## Open Questions

없음. Linear 정정으로 범용 system 일반화를 폐기하고 Web inbound와 후속 Temporal Activity의 Fedify 전용 경계로 확정했다.
