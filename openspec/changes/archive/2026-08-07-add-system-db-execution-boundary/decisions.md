## Context

이 기록은 `PROD-706`의 additive system DB execution boundary, `docs/architecture/core-services.md`의 transaction·post-commit 책임과 현재 전역 owner DB/optional transaction 구현을 반영한다. Post system SQL 이전, GraphQL operation context와 credential/RLS 전환은 각 downstream 이슈에 남긴다.

## Decision Records

### Database와 caller transaction을 하나의 additive handle 계약으로 받는다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-706`
- Status: Active
- Context / Problem: 현재 core service의 optional `Transaction`은 caller transaction 합성은 지원하지만 별도 system database handle 선택을 표현하지 못한다. 기존 caller와 owner fallback은 동시에 유지해야 한다.
- Decision Outcome: 공유 DB 선택 계약은 top-level database와 caller transaction을 모두 받는 handle로 확장한다. handle이 없으면 기존 singleton owner DB를 선택하고, handle이 있으면 service-owned transaction은 그 handle에서 시작하거나 savepoint로 합류한다.
- Alternatives Considered: 기존 `Transaction`만 유지하면 향후 system credential별 database handle을 전달할 수 없다. generic repository/Database interface를 새로 만들면 production implementation이 하나인 현재 요구보다 큰 추상화가 된다. 전역 fallback을 즉시 제거하면 기존 caller와 독립 배포 계약을 깨뜨린다.
- Consequences: 기존 positional transaction caller는 동작을 유지하고 downstream slice가 database handle을 점진적으로 전달할 수 있다. handle과 transaction의 이름·타입을 명확히 구분해야 한다.
- Confirmation / Follow-up: typecheck, 전달 handle identity, owner fallback과 caller transaction rollback 회귀로 확인한다.

### Federation fetch가 아니라 각 system action이 transaction을 소유한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-706`
- Status: Active
- Context / Problem: federation 요청 전체를 transaction으로 감싸면 아직 전역 DB를 쓰는 SQL과 무관한 idle transaction을 만들고, 향후 SQL 이전 뒤 handler의 post-commit effect가 실제 outer commit 전에 실행될 수 있다.
- Decision Outcome: system execution context는 재사용 가능한 DB handle만 보유하고, 원자성이 필요한 system action helper가 그 handle에서 transaction을 열어 callback에 transaction 전용 context를 전달한다. action callback이 반환된 뒤 transaction이 commit되고, caller는 그 뒤 기존 post-commit effect를 실행한다.
- Alternatives Considered: federation fetch 전체 transaction은 request lifecycle은 단순하지만 post-commit 의미와 pool 점유 위험이 있다. context에 transaction을 미리 만들어 넣으면 action 경계와 transaction 수명이 결합되고 미사용 요청에도 transaction이 열린다. 각 handler가 제각각 전역 DB transaction을 열면 공통 명시 경계를 제공하지 못한다.
- Consequences: context 생성 자체는 connection을 점유하지 않으며 action 성공·오류에서만 transaction lifecycle이 발생한다. PROD-710은 각 Post system action의 정확한 transaction·post-commit 조립 위치를 선택해야 한다.
- Confirmation / Follow-up: 성공 commit, 오류 rollback, caller transaction savepoint, 반복 실행 뒤 pool 사용 가능성과 기존 post-commit 회귀로 확인한다.

### System context에는 DB handle만 넣고 credential이나 role escape hatch를 두지 않는다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-706`
- Status: Active
- Context / Problem: system context가 API viewer context와 섞이거나 credential, owner fallback, BYPASSRLS flag를 받으면 API가 system 역할을 가장하거나 후속 credential 전환을 우회할 수 있는 공개 seam이 된다.
- Decision Outcome: system context는 `readonly db` 참조만 가진 별도 타입으로 유지하고 trusted federation/system 조립 내부에서 생성한다. `readonly`는 참조 불변이며 handle의 DML·transaction capability를 제한하지 않는다. package root와 API viewer context/import surface에는 factory, credential, role selector 또는 raw pool client를 추가하지 않는다. web은 context를 직접 만들지 않고 trusted Fedify runtime adapter를 호출한다.
- Alternatives Considered: 하나의 범용 request context에 viewer/system discriminator를 넣으면 인증 경계가 넓어진다. credential/role selector를 context input으로 받으면 PROD-709/715의 runtime-owned credential 선택을 application caller가 우회할 수 있다.
- Consequences: API와 system execution lifecycle이 타입과 조립에서 분리된다. 역할별 실제 handle 생성은 runtime configuration을 소유한 후속 변경이 맡는다.
- Confirmation / Follow-up: API context diff가 없고 package root/API import surface가 system context factory나 raw credential·client를 노출하지 않는지 정적 검색과 self-review로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
