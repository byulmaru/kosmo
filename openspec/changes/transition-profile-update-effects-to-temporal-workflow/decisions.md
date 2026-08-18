## Context

이 기록은 PROD-665와 canonical Profile/Core 경계에 따라 Profile 상태 transaction을 유지하고 commit 이후 ActivityPub 효과만 Temporal로 이전하는 선택을 정리한다. Stable identity의 구체 구현은 2026-08-18 사용자 확인에서 자동 생성 방식을 선택했다.

## Decision Records

### Profile 상태 transaction은 Core에 유지한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`, `PROD-665`
- Status: Active
- Context / Problem: 기존 action은 상태 transaction과 후속 Fedify 효과를 `postCommit` 반환형으로 나눠 caller가 조립한다.
- Decision Outcome: Core action이 기본 database의 Profile update transaction을 동기적으로 완료하고, 실제 actor-visible commit 뒤 Workflow start만 직접 시도한다.
- Alternatives Considered: Transaction Activity로 상태 변경 이동, caller database handle과 `postCommit` 유지. 전자는 승인된 책임 경계를 바꾸고 후자는 PROD-665의 제거 대상이다.
- Consequences: GraphQL caller는 database handle이나 lifecycle callback을 조립하지 않는다. Start 실패는 commit된 Profile 성공을 변경하지 않는다.
- Confirmation / Follow-up: Core/API 테스트에서 rollback·no-op·start failure 경계를 검증한다.

### Update identity를 자동 생성해 Temporal Workflow ID로 그대로 사용한다

- Decision Date: 2026-08-18
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-665`
- Status: Active
- Context / Problem: Temporal은 Workflow ID를 필수로 요구하고, 같은 Profile의 연속 update는 서로 다른 실행이어야 하며, 같은 Activity retry는 ActivityPub Update identity를 재사용해야 한다.
- Decision Outcome: 실제 actor-visible 변경이 확정된 transaction 안에서 UUID update identity를 자동 생성한다. Commit 뒤 Temporal start의 Workflow ID에는 prefix를 추가하지 않고 이 identity 자체를 전달하며, ActivityPub Update IRI도 같은 identity에서 파생한다.
- Alternatives Considered: Profile ID만 사용하면 후속 update가 기존 실행과 충돌한다. DB projection version은 migration과 ordering 계약을 추가한다. 별도 Workflow ID 규칙은 update identity와 중복된다.
- Consequences: Rollback된 변경의 identity는 폐기된다. DB에 update identity를 저장하지 않으며 commit-to-start gap의 backfill에는 사용할 수 없다.
- Confirmation / Follow-up: Core start 인자와 Fedify retry가 같은 identity를 유지하는지 검증한다.

### Profile projection은 latest-at-delivery로 읽는다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`, `PROD-665`
- Status: Active
- Context / Problem: 빠른 연속 Profile update가 각 commit 시점 snapshot을 보존하려면 version 또는 별도 durable projection이 필요하다.
- Decision Outcome: Activity는 실행 시점의 최신 committed Profile·Media를 기존 canonical Person projection으로 읽는다. Cross-update ordering과 commit 시점 snapshot은 보장하지 않는다.
- Alternatives Considered: Profile version, Workflow input snapshot, ordering ledger. 모두 현재 이슈가 제외한 새 DB·ordering 계약을 만든다.
- Consequences: 서로 다른 update Workflow가 같은 최신 projection을 전달하거나 원격에서 순서가 바뀔 수 있으며 last-write-wins로 수용한다.
- Confirmation / Follow-up: 빠른 연속 update dev 검증에서 별도 identity와 latest projection 동작을 확인하되 순서 보장으로 해석하지 않는다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- PROD-629의 호출마다 새 Activity UUID를 생성하는 direct post-commit delivery 선택은 stable retry identity를 요구하는 PROD-665로 대체된다.
