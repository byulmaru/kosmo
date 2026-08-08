## 1. PROD-706 Fedify DB handle 계약

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-706`

**Deliverable**

Fedify downstream이 database 또는 transaction handle을 선택할 수 있고 기존 caller는 전역 owner DB 동작을 유지한다.

**Guardrails**

- handle이 없을 때 현재 owner DB fallback을 유지한다.
- core service widening은 Post Fedify downstream이 사용할 기존 optional transaction seam으로 제한한다.
- Bookmark, Session, local Reaction/Profile update와 notification/background 권한 경계를 일반화하지 않는다.
- production SQL callsite를 새 handle로 이전하지 않는다.

**Verification**

- 전달 handle 선택, owner fallback, caller transaction identity와 core typecheck를 검증한다.

- [x] 1.1 database와 transaction을 포괄하는 additive `DatabaseHandle` 및 선택 helper를 구현한다.
- [x] 1.2 Fedify와 무관한 core service widening을 제거하고 Post의 기존 optional transaction seam만 유지한다.
- [x] 1.3 전달 handle, fallback과 transaction 합성 회귀 테스트를 통과시킨다.

## 2. PROD-706 Fedify execution context와 lifecycle

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-706` 정정 설명과 댓글

**Deliverable**

Web inbound와 후속 Temporal Activity가 재사용할 Fedify 전용 DB handle context와 action transaction 수명 경계를 제공한다.

**Guardrails**

- `FedifyExecutionContext`는 DB handle 외 credential, role selector, raw pool client나 owner/BYPASSRLS flag를 노출하지 않는다.
- factory와 action runner를 package root/API import surface에 공개하지 않는다.
- Web에는 inbound 전용 adapter만 공개하고 범용 Fedify fetch/API outbound seam을 추가하지 않는다.
- federation fetch 전체에 transaction을 열지 않는다.
- Temporal Workflow/Activity와 Worker Deployment를 구현하지 않는다.

**Verification**

- invocation별 context identity, supplied handle, commit·rollback, nested transaction과 반복 성공·실패 뒤 pool 사용 가능성을 검증한다.

- [x] 2.1 production 타입·helper·파일을 Fedify 전용 명명과 package-internal 경계로 수정한다.
- [x] 2.2 Web inbound 전용 adapter가 invocation마다 context를 전달하고 package root에는 generic fetch/factory가 없게 한다.
- [x] 2.3 context 격리, supplied handle, commit·rollback, nested transaction과 pool cleanup 회귀 테스트를 통과시킨다.

## 3. PROD-706 독립 배포 경계와 검증

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-706`

**Deliverable**

Fedify 기반만 배포·rollback해도 기존 owner credential, 미이전 SQL과 ActivityPub·post-commit 행동이 유지되고 PROD-710이 Post Fedify SQL을 별도 이전할 수 있다.

**Guardrails**

- 기존 API direct outbound delivery를 durable intent/Temporal로 전환하지 않는다.
- Post production SQL, GraphQL operation context, credential, role, RLS policy·grant와 schema를 변경하지 않는다.
- notification/background system abstraction과 ActivityPub 제품 행동을 추가하지 않는다.

**Verification**

- core, Fedify, Web 테스트와 TypeScript, ESLint, Prettier, strict OpenSpec validation을 실행한다.
- production diff에서 범용 system 명명, API factory/generic fetch, schema·credential·RLS·Post SQL 이전이 없는지 self-review한다.

- [x] 3.1 architecture와 활성 capability를 Fedify 전용 책임으로 동기화한다.
- [x] 3.2 관련 unit·DB-backed·Web 회귀 테스트와 정적 검증을 통과시킨다.
- [x] 3.3 strict OpenSpec validation과 범위 self-review를 완료한다.
