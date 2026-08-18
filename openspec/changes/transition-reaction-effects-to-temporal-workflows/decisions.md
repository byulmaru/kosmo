## Context

이 기록은 `PROD-723`의 최신 Issue Gate, Reaction·Notification canonical 객체, ActivityPub Reaction delivery 계약과 현재 Core/Fedify 구현을 바탕으로 한다. Reaction 상태 transaction은 유지하고 commit 뒤 효과만 Temporal Worker로 옮기는 변경의 지속적인 경계를 기록한다.

## Decision Records

### Reaction 상태 전이는 Core transaction에 유지한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/architecture/core-services.md`, `PROD-723`
- Status: Active
- Context / Problem: 후속 효과를 retry하려고 Reaction DML까지 Temporal Activity로 옮기면 기존 request transaction, idempotency와 rollback 경계가 바뀐다.
- Decision Outcome: Local과 ActivityPub Reaction 생성·삭제는 Core가 동기 transaction으로 완료한다. Commit 뒤 실제 transition 결과에만 Effects Workflow start를 시도한다.
- Alternatives Considered: Transaction Activity, proposed Reaction ID, command receipt, outbox와 relay는 승인된 범위보다 넓어 사용하지 않는다.
- Consequences: Workflow start gap은 남지만 domain 결과는 Temporal 가용성에 종속되지 않는다.
- Confirmation / Follow-up: duplicate, no-op, rollback과 start failure 테스트에서 Workflow start 횟수와 caller 결과를 검증한다.

### Create와 Delete Effects Workflow를 분리한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `PROD-723`
- Status: Active
- Context / Problem: Create는 현재 Reaction을 다시 읽지만 Delete는 이미 사라진 row의 identity를 사용한다. 동일 완료 Workflow ID를 공유하면 delete start가 거부될 수 있다.
- Decision Outcome: Create와 Delete를 별도 Workflow type으로 두고 각각 `reaction-create-effects:{reactionId}`, `reaction-delete-effects:{reactionId}` identity를 사용한다.
- Alternatives Considered: 하나의 generic Workflow와 transition discriminator는 입력 생존 조건이 다른 두 경계를 다시 결합하므로 사용하지 않는다. 같은 Reaction ID만 공유하는 하나의 Workflow ID는 completed execution 충돌 때문에 사용하지 않는다.
- Consequences: Worker registry와 Temporal contract가 두 entrypoint를 갖지만 조건 분기와 history identity는 단순해진다.
- Confirmation / Follow-up: stable ID, conflict/reuse policy와 create/delete 독립 start를 contract test로 검증한다.

### Delete Workflow에는 deleted Reaction row만 전달한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `PROD-499`, `PROD-723`
- Status: Active
- Context / Problem: Reaction과 inbound mapping은 delete commit 뒤 사라지므로 ID만으로 원본 Like·EmojiReact와 Undo identity를 복원할 수 없다.
- Decision Outcome: Delete transaction의 `RETURNING` 결과에서 `id`, `profileId`, `postId`, `type`, `createdAt`과 origin만 serializable Workflow input으로 전달한다. 시간 값은 문자열로 직렬화한다.
- Alternatives Considered: 새 snapshot table, generation ledger, receipt와 full domain snapshot은 불필요한 persistence와 migration을 추가하므로 사용하지 않는다. Delete Activity의 DB 재조회는 source가 이미 없어 성립하지 않는다.
- Consequences: Notification cleanup은 ID를 사용하고 Undo Activity는 immutable Reaction 값으로 원본 activity URI와 ordering key를 복원한다. Recipient availability와 visibility는 실행 시점에 다시 조회한다.
- Confirmation / Follow-up: 삭제 후 exact Like·EmojiReact Undo와 직렬화 round-trip을 검증한다.

### Inbound mapping atomicity는 Core 내부 transaction composition으로 보존한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/architecture/core-services.md`, `PROD-723`
- Status: Active
- Context / Problem: Public database handle을 제거하면서도 Like·EmojiReact mapping과 Reaction 생성, Undo mapping과 Reaction 삭제는 같은 transaction에 남아야 한다.
- Decision Outcome: 기존 inbound materialization action이 outer Core transaction을 소유하고 transaction-scoped Reaction primitive를 내부에서 재사용한다. Local public action은 기본 database transaction을 직접 소유한다. Public API/Fedify caller에는 database handle을 노출하지 않는다.
- Alternatives Considered: Mapping을 Reaction commit 뒤 별도 transaction으로 저장하면 rollback과 first-write atomicity가 깨진다. Public optional handle을 유지하면 caller 조립 책임 제거 목표를 충족하지 못한다.
- Consequences: Core 내부에는 transaction composition seam이 남지만 public service 계약은 단순해진다. MAPPED와 DUPLICATE는 Workflow를 시작하지 않는다.
- Confirmation / Follow-up: mapping insert rollback, URI conflict, concurrent delivery와 exact Undo integration test를 유지한다.

### Notification과 federation handoff는 독립 Activity로 실행한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/objects/reaction.md`, `PROD-448`, `PROD-723`
- Status: Active
- Context / Problem: 한 후속 효과의 terminal failure가 sibling 효과를 건너뛰면 Workflow가 기존 best-effort 정책보다 좁은 결과를 만든다.
- Decision Outcome: Workflow는 적용 가능한 Activity를 독립적으로 시작하고 모든 결과를 수집한다. Local origin만 federation handoff를 포함하고 ActivityPub origin은 outbound echo를 만들지 않는다. Federation Activity 성공 경계는 queue acceptance다.
- Alternatives Considered: 순차 await와 첫 실패 즉시 반환은 sibling 효과를 차단하므로 사용하지 않는다. Remote delivery 자체를 Temporal에서 소유하는 방식은 Fedify queue 책임과 충돌한다.
- Consequences: Workflow는 여러 terminal failure를 관측할 수 있고 Fedify는 acceptance 이후 retry를 계속 소유한다.
- Confirmation / Follow-up: 테스트 전용 Workflow export나 Node module mock을 추가하지 않는다. Notification/Fedify Activity는 PR 통합 테스트로 검증하고, sibling Activity 실패 격리는 exact revision의 dev Workflow 실행에서 검증한다.

### Reaction Notification은 source row를 잠그지 않는다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-328`, `PROD-419`, `PROD-723`
- Status: Active
- Context / Problem: 기존 Notification 생성은 best-effort projection의 orphan 방지를 위해 Reaction row를 `FOR UPDATE`로 잠그며 source 삭제를 지연한다. Workflow create/delete는 서로 독립 실행되어 이 lock만으로 전체 lifecycle ordering을 보장할 수도 없다.
- Decision Outcome: Reaction Notification 생성의 source row lock을 제거한다. 교차 실행으로 unavailable Notification이 남을 수 있는 낮은 위험을 수용하고 기존 API source visibility로 숨긴다.
- Alternatives Considered: Lock 유지, 새 FK, create/delete serialization과 durable reconciliation을 이번 변경에 포함하는 방식은 best-effort 효과 때문에 source path를 지연하거나 PROD-328 책임을 흡수하므로 사용하지 않는다.
- Consequences: Reaction transaction latency는 Notification projection에 종속되지 않는다. Unavailable row의 durable 정리는 계속 PROD-328 범위다.
- Confirmation / Follow-up: lock 없는 create/delete race에서 source action이 차단되지 않고 unavailable item이 API에 노출되지 않는지 검증한다.

### Commit과 Workflow start 사이 gap을 수용한다

- Decision Date: 2026-08-18
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-723`
- Status: Active
- Context / Problem: 별도 durable intent 없이 commit과 Workflow start를 원자화할 수 없다.
- Decision Outcome: Start 실패를 관측하되 committed Reaction과 application 또는 ingress 성공을 유지한다. 자동 backfill은 수행하지 않는다.
- Alternatives Considered: Transactional outbox, receipt, relay와 reconciliation은 명시적 제외 범위다.
- Consequences: Start 전 process 종료에서는 Notification 또는 federation 효과가 유실될 수 있다.
- Confirmation / Follow-up: start failure와 observer failure 격리 테스트를 추가하고 PR/CI를 delivery 완료 증거로 과장하지 않는다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
