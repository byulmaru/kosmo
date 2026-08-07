## Context

이 기록은 정정된 `PROD-706`의 Fedify 전용 DB execution boundary와 `docs/architecture/core-services.md`의 transaction·post-commit 책임을 반영한다. notification/background 일반화, Temporal 구현, Post Fedify SQL 이전, GraphQL operation context와 credential/RLS 전환은 소유하지 않는다.

## Decision Records

### Database와 caller transaction을 하나의 additive handle 계약으로 받는다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-706`
- Status: Active
- Context / Problem: 기존 optional `Transaction`만으로는 미래 Fedify runtime database handle 선택을 표현할 수 없지만 기존 caller와 owner fallback은 유지해야 한다.
- Decision Outcome: DB 선택 계약은 top-level database와 caller transaction을 모두 받는 `DatabaseHandle`로 확장한다. 이 PR의 core service 변경은 downstream Post Fedify SQL 이전이 소비할 기존 optional seam으로 제한한다.
- Alternatives Considered: generic repository abstraction은 요구보다 크고, 모든 optional transaction service를 기계적으로 widening하면 Fedify 전용 이슈 경계를 넘는다.
- Consequences: 기존 positional transaction caller는 유지되고 PROD-710이 Post seam을 점진적으로 사용할 수 있다.
- Confirmation / Follow-up: typecheck, owner fallback과 caller transaction identity 회귀로 확인한다.

### Federation fetch가 아니라 각 Fedify action이 transaction을 소유한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-706`
- Status: Active
- Context / Problem: federation 요청 전체 transaction은 미사용 idle transaction과 잘못된 post-commit effect 시점을 만든다.
- Decision Outcome: Fedify execution context는 DB handle만 보유하고 원자성이 필요한 Fedify action helper가 그 handle에서 transaction을 연다. callback 반환 뒤 commit되고 caller는 그 뒤 post-commit effect를 실행한다.
- Alternatives Considered: fetch-wide transaction, 미리 열린 transaction context와 각 handler의 전역 DB 사용은 transaction 수명 또는 명시적 전달 요구를 깨뜨린다.
- Consequences: context 생성은 connection을 점유하지 않으며 PROD-710이 각 Post action의 정확한 조립 위치를 선택한다.
- Confirmation / Follow-up: commit, rollback, nested savepoint와 pool 재사용 테스트로 확인한다.

### Execution context는 Fedify 전용 package-internal 경계다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-706` 정정 설명과 실행 경계 정정 댓글
- Status: Active
- Context / Problem: 기존 artifact의 범용 system/notification/background 일반화는 목표 구조와 달리 API 또는 다른 workload에 우회 가능한 privileged seam을 만들 수 있다.
- Decision Outcome: 타입과 helper를 `FedifyExecutionContext`, `createFedifyExecutionContext`, `withFedifyAction`으로 한정한다. factory와 action runner는 package root/API surface에 export하지 않는다. Web은 inbound adapter만 호출하고 후속 Temporal Activity는 Fedify package 내부 adapter에서 같은 경계를 재사용한다.
- Alternatives Considered: 범용 `SystemExecutionContext`와 API가 import할 factory는 정정된 이슈에서 명시적으로 폐기됐다. 지금 Temporal Worker를 만드는 것은 별도 배포 이슈를 가져온다.
- Consequences: notification/background 작업은 이 capability의 권한이나 재사용 근거를 얻지 않으며 API outbound는 durable intent/Temporal 전환 전까지 별도 기존 경계로 남는다.
- Confirmation / Follow-up: 정적 검색에서 production `system-execution` 명명과 package root factory export가 없고 API diff가 없는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 정정 전 `System context에는 DB handle만 넣고 credential이나 role escape hatch를 두지 않는다` 결정은 Fedify 전용 package-internal context 결정으로 대체한다.
