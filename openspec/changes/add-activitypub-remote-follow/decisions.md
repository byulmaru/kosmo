## Context

이 기록은 [PROD-357](https://linear.app/byulmaru/issue/PROD-357), 부모 PROD-235와 구현 자식 이슈를 source of truth로 사용한다. 2026-06-29에 작성된 초기 active change는 이후 생긴 이슈 구조를 정의하지 않으며, 저장 count, core service, actor materialization, inbox route와 pending-only request 계약이 확정된 뒤의 구현 slice가 공유해야 할 선택을 기록한다.

## Decision Records

### Linear 계약을 PROD-357 OpenSpec으로 먼저 구체화한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 기존 active change가 Linear 이슈 구조보다 먼저 만들어져 여러 구현 PR이 같은 change를 서로 다른 책임으로 해석했다.
- Decision Outcome: PROD-235와 구현 이슈가 source of truth이며, PROD-357의 spec-only PR이 이를 proposal/spec/design/decisions/tasks로 번역하고 남은 구현 자식을 merge 전까지 block한다.
- Alternatives Considered: 기존 OpenSpec을 source of truth로 두고 이슈를 맞추기, 각 구현 PR이 자기 task만 수정.
- Consequences: 구현 PR은 shared 계약을 재정의하지 않으며 PROD-235 전체 범위가 끝날 때까지 change를 archive하지 않는다.
- Confirmation / Follow-up: PROD-357 PR의 strict validation과 Linear dependency를 확인한다.

### Pending-only request lifecycle은 PROD-272가 소유한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: PROD-243과 PROD-272가 remote request 생성 책임을 중복 기술했다.
- Decision Outcome: PROD-272가 local/remote 공통 request 생성·조회·승인·거절·취소 domain lifecycle을 소유하고, PROD-243은 ActivityPub 검증과 correlation metadata 전달만 소유한다.
- Alternatives Considered: PROD-243이 remote request service를 별도로 구현, request 전체를 PROD-243에 흡수.
- Consequences: PROD-243은 PROD-272 boundary가 main에 병합될 때까지 blocked이며 request row에 terminal 상태를 저장하지 않는다.
- Confirmation / Follow-up: PROD-272와 PROD-243 통합 테스트에서 같은 pending-only invariant를 검증한다.

### Inbound correlation과 조건부 삭제는 PROD-243이 소유한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 완료된 PROD-240에는 correlation/generation이 없고 PROD-243/244가 삭제 primitive 소유권을 다르게 기술했다.
- Decision Outcome: PROD-243이 inbound first-wins identity/response metadata, monotonic generation, exact-row·expected-generation relation/request 삭제와 relation count transaction을 제공한다. PROD-244는 이 primitive를 재사용한다.
- Alternatives Considered: PROD-240을 다시 열기, PROD-244가 primitive를 구현, 별도 foundation 이슈 추가.
- Consequences: PROD-244는 PROD-243을 기다리며 별도 삭제 로직을 만들지 않는다.
- Confirmation / Follow-up: delayed Undo와 stale Reject가 새 generation을 삭제하지 않는 concurrency test를 둔다.

### Outbound Follow correlation은 현재 저장 identity에서 파생한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 초기 change는 outbound actor/object/orderingKey를 별도 metadata로 저장하도록 요구했지만 현재 모델의 immutable identity로 같은 값을 결정할 수 있다.
- Decision Outcome: Follow URI는 canonical origin과 `ProfileFollow.id`, actor/object는 저장된 profile actor identity, generation은 `ProfileFollow.createdAt`, ordering key는 actor pair에서 파생한다.
- Alternatives Considered: outbound correlation column 추가, 별도 activity table.
- Consequences: outbound-only metadata를 중복 저장하지 않으며 retry/history가 필요하면 별도 capability에서 다룬다.
- Confirmation / Follow-up: PROD-242/244가 refollow identity와 actor/object 검증을 테스트한다.

### Remote Follow ID는 advisory이고 generation은 단조 증가한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: remote 서버가 Follow ID를 누락·재사용할 수 있고 늦은 Undo가 새 관계를 삭제할 수 있다.
- Decision Outcome: actor/object/recipient가 canonical correlation 조건이며 ID는 hint로만 사용한다. first-wins metadata는 보존하고 verified duplicate Follow의 generation만 max 갱신한다.
- Alternatives Considered: Follow ID exact match 필수, 모든 activity ID를 durable log에 저장.
- Consequences: published가 없는 activity는 수신 시각 fallback을 사용하며 완전한 네트워크 순서 복원은 보장하지 않는다.
- Confirmation / Follow-up: duplicate Follow와 delayed Undo 순서를 테스트한다.

### SUSPENDED 관계는 보존한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 초기 change와 PROD-242는 SUSPENDED target의 local unfollow 삭제를 허용했지만 현재 core service와 PROD-282 정책은 NotFound와 관계 보존이다.
- Decision Outcome: SUSPENDED remote profile은 follow/unfollow 조회에서 숨기고 기존 relation/count를 보존한다. inbound activity도 side effect 없이 무시한다.
- Alternatives Considered: local-only 삭제와 nullable payload, suspension 시 relation 삭제.
- Consequences: suspension 해제 뒤 기존 관계를 다시 사용할 수 있으며 PROD-282는 GraphQL 회귀 검증만 소유한다.
- Confirmation / Follow-up: relation 유무 두 경우의 NotFound와 저장 count 불변을 검증한다.

### 기존 inbox route에 handler를 직접 등록한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: PR #247이 actor-scoped/shared inbox route를 이미 병합했으며 추가 registry는 현재 소비자가 없다.
- Decision Outcome: 공통 actor-scoped/shared inbox route는 activity-neutral transport 경계로 유지하고, 각 activity 구현 slice는 중앙 싱글톤 federation의 기존 inbox listener에 typed handler를 등록한다. Follow change는 Follow/Undo/Accept/Reject 행동만 소유하며 다른 activity를 금지하거나 정의하지 않는다.
- Alternatives Considered: 별도 listener registry export, placeholder handler, slice별 federation instance.
- Consequences: 새로운 HTTP foundation을 만들지 않고 PROD-241 transport를 재사용하며, remote-post change와 동일 discovery requirement를 서로 덮어쓰지 않는다.
- Confirmation / Follow-up: actor-scoped/shared inbox 통합 테스트로 routing과 Follow handler 호출을 검증하고 unsupported activity가 follow side effect를 만들지 않는지 확인한다.

## Remaining Decisions

- authenticated shared-inbox document loader identity는 PROD-355가 소유한다.
- delivery queue/retry/history와 durable activity log는 별도 이슈와 OpenSpec에서 결정한다.

## Superseded Decisions

- 초기 design의 “PROD-240이 correlation/generation과 조건부 삭제를 제공한다”는 가정은 PROD-243 소유 결정으로 대체한다. PROD-240의 실제 병합 범위는 저장 count와 relation/count transaction 기반이다.
- 초기 design의 SUSPENDED local-only deletion과 nullable unfollow payload는 SUSPENDED 관계 보존·NotFound 결정으로 대체한다.
- 초기 design의 outbound correlation metadata 저장 요구는 `ProfileFollow.id`/`createdAt`과 actor identity에서 파생하는 결정으로 대체한다.
