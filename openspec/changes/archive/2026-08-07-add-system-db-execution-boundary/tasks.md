## 1. PROD-706 명시적 DB handle 계약

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-706`

**Deliverable**

공유 core service가 caller의 database 또는 transaction handle을 선택적으로 사용하고 기존 caller는 전역 owner DB 동작을 유지한다.

**Guardrails**

- handle이 없을 때 현재 owner DB fallback을 유지한다.
- caller transaction의 savepoint·rollback 합성과 post-commit 의미를 바꾸지 않는다.
- generic repository나 복수 DB implementation abstraction을 추가하지 않는다.

**Verification**

- 전달 handle 선택, owner fallback, caller transaction rollback과 core service typecheck를 검증한다.

- [x] 1.1 database와 transaction을 포괄하는 additive handle 및 선택 계약을 구현한다.
- [x] 1.2 `getDatabaseConnection`을 사용하는 기존 optional transaction core service의 compatibility seam만 명시적 database handle로 넓히고 production SQL callsite는 이전하지 않는다.
- [x] 1.3 전달 handle, fallback과 transaction 합성 회귀 테스트를 통과시킨다.

## 2. PROD-706 System execution context와 lifecycle

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-706`

**Deliverable**

system 작업이 요청·작업별 DB handle context를 받고 action 단위 transaction의 commit·rollback·정리를 명시적으로 소유한다.

**Guardrails**

- system context의 `readonly db`는 참조 불변을 뜻하며 DML·transaction capability를 제한하지 않는다.
- system context는 DB handle 외 credential, role selector, raw pool client나 owner/BYPASSRLS escape hatch를 노출하지 않고 factory를 package root/API import surface에 공개하지 않는다.
- federation fetch 전체에 transaction을 열어 post-commit effect를 outer commit 안으로 이동하지 않는다.
- API viewer context에 system context 생성 seam을 추가하지 않는다.

**Verification**

- 요청별 context identity, 성공 commit, 오류 rollback, caller transaction savepoint와 반복 성공·실패 뒤 pool 사용 가능성을 DB-backed 테스트로 검증한다.

- [x] 2.1 system execution context 생성과 action-owned transaction lifecycle을 구현한다.
- [x] 2.2 trusted federation runtime adapter가 매 invocation 명시적 system context를 전달하고 web은 factory 없이 adapter를 사용하게 한다.
- [x] 2.3 context 격리, commit·rollback, nested transaction과 pool cleanup 회귀 테스트를 통과시킨다.

## 3. PROD-706 독립 배포 경계와 검증

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-706`

**Deliverable**

기반만 배포·rollback해도 기존 owner credential, 미이전 system SQL과 ActivityPub·post-commit 행동이 유지되고 downstream PROD-710이 별도 이전을 수행할 수 있다.

**Guardrails**

- Post/Profile/Media/Notification production SQL callsite를 전면 이전하지 않는다.
- GraphQL operation context, credential, role, RLS policy·grant와 schema migration을 변경하지 않는다.
- ActivityPub 제품 응답과 기존 오류·fallback 동작을 변경하지 않는다.

**Verification**

- core, Fedify, web 관련 테스트와 TypeScript, ESLint, Prettier, strict OpenSpec validation을 실행한다.
- diff에서 schema·credential·RLS·Post SQL 이전이 없고 API import surface에 system factory가 없는지 self-review한다.

- [x] 3.1 core service와 system execution 책임을 architecture 문서에 좁게 동기화한다.
- [x] 3.2 관련 unit·DB-backed·web 회귀 테스트와 정적 검증을 통과시킨다.
- [x] 3.3 strict OpenSpec validation과 범위 self-review를 완료한다.
