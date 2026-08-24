## Context

현재 Profile update action은 optional database handle을 받아 transaction에 합류하고, 결과의 `postCommit`이 Fedify Profile Update delivery를 직접 실행한다. GraphQL resolver는 database handle 전달과 callback 실행을 조립하며, delivery 함수는 호출마다 새 ActivityPub Update ID를 생성한다. 이 구조에서는 queue handoff 실패를 Worker restart 뒤 재시도할 수 없고 같은 Activity retry에서 identity도 유지할 수 없다.

PROD-665는 상태 transaction을 Temporal로 옮기지 않는다. Core action이 기존 Profile persistence와 actor-visible 변경 판정을 유지하고, 실제 commit 뒤 후속 delivery만 하나의 Effects Workflow로 연결한다.

## Goals / Non-Goals

**Goals:**

- Core가 Profile update transaction과 commit 이후 Workflow start 시도를 소유한다.
- 실제 actor-visible 변경만 Workflow를 시작한다.
- 동일 Workflow retry에서 stable ActivityPub Update identity를 유지한다.
- Worker Activity가 delivery 시점의 최신 committed Profile을 queue에 handoff한다.
- API의 database handle과 `postCommit` 조립을 제거한다.

**Non-Goals:**

- Profile transaction을 Temporal Activity로 옮기지 않는다.
- projection version, update ledger, ordering, outbox, receipt, relay 또는 backfill을 만들지 않는다.
- GraphQL schema, UI, DB schema, Fedify consumer runtime을 변경하지 않는다.
- production sync·rollout·live verification을 수행하지 않는다.

## Implementation Guidance

### Current Constraints

- Actor-visible 변경은 displayName, bio, followPolicy, avatar와 header 관계다. Tag와 default Post visibility는 현재 canonical Person projection 대상이 아니다.
- Delivery 함수는 최신 Profile·Media를 읽는 기존 canonical projection과 recipient dispatcher를 이미 재사용한다.
- Temporal SDK는 start마다 Workflow ID를 요구한다.
- 같은 Profile의 빠른 연속 변경은 각기 별도 효과 실행이어야 하므로 Profile ID만 Workflow ID로 사용할 수 없다.

### Recommended Approach

Core transaction이 실제 actor-visible 변경을 확정할 때 UUID update identity를 생성해 transaction 결과와 함께 반환한다. Rollback되면 identity도 폐기된다. Transaction commit 뒤 Core는 `{ profileId, updateId }`를 인자로 Profile Update Workflow를 직접 start하고, Temporal Workflow ID에는 별도 prefix 없이 update identity 자체를 사용한다. Start 실패는 그 자리에서 관측하고 Profile 결과는 유지한다.

Worker의 Profile Update Workflow는 private input type을 소유하고 단일 delivery Activity를 호출한다. Activity registration은 기존 production activities namespace에 Fedify delivery 함수를 alias하는 수준으로 유지한다. 별도 Core Temporal contract file이나 start helper를 만들지 않는다.

Fedify delivery 함수는 Profile ID와 update identity를 받아 기존 canonical Person projection과 recipient dispatcher를 사용하고, Update IRI의 마지막 segment에 update identity를 사용한다. Activity retry는 같은 입력을 다시 받아 같은 IRI를 구성한다.

### Allowed Alternatives

Update IRI의 정확한 path 표현은 같은 update identity가 retry 동안 같은 canonical IRI로 이어지고 기존 actor URI 아래에 남는 한 구현자가 선택할 수 있다.

### Known Traps

- Profile ID를 Workflow ID로 사용하면 첫 완료 실행과 후속 update가 충돌한다.
- Activity 안에서 UUID를 새로 만들면 retry마다 다른 ActivityPub Update가 된다.
- Profile snapshot을 Workflow input에 넣으면 latest-at-delivery 계약과 어긋난다.
- 별도 start helper, workflow별 Core contract file, test-only export는 이 단일 호출 경계를 숨기기만 한다.
- Workflow start 실패를 GraphQL 실패로 전파하면 이미 commit된 Profile 결과와 caller 응답이 불일치한다.

## Risks / Trade-offs

- [Commit과 Workflow start 사이 process 종료로 효과 유실] → 이번 범위는 durable intent를 추가하지 않고 이 loss window를 명시적으로 수용한다.
- [빠른 연속 update가 같은 최신 projection을 전달하거나 원격 순서가 뒤바뀜] → last-write-wins를 수용하고 version·ordering 보장을 주장하지 않는다.
- [Activity retry가 queue message를 중복 수락시킬 수 있음] → stable ActivityPub identity를 재사용하고 queue acceptance 이후 remote retry는 Fedify가 소유한다.

## Migration Plan

1. Core Profile action과 API caller를 자체 transaction·direct Workflow start 경계로 전환한다.
2. Fedify delivery에 stable update identity 입력을 추가한다.
3. 기존 Worker registry에 Profile Update Workflow와 Activity를 추가한다.
4. 정적·통합 검증과 exact revision dev retry·restart 검증을 수행한다.
5. Rollback은 application revision을 이전 버전으로 되돌린다. DB migration은 없다.

## Open Questions

없음.
