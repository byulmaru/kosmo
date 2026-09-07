## Context

이 기록은 `PROD-743`이 승인한 Profile Migration과 inbound ActivityPub `Move` 범위를 하나의 구현·검증 결과로 연결한다. 정본 Profile·Follow 계약, ADR 0027과 Settings 디자인이 정한 source 준비, identity 검증, Follow 이전 순서, feature flag 경계를 구현 전에 확인 가능한 결정으로 정리한다.

## Decision Records

### 하나의 change가 PROD-743의 닫힌 Profile 이전 결과를 소유한다

- Decision Date: 2026-09-07
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/design/settings.md`, `PROD-743`
- Status: Active
- Context / Problem: Settings 준비 UI, Actor 표현, inbound Move와 Follow 이전을 계층별로 분리하면 어느 slice가 전체 Profile 이전 결과와 archive를 증명하는지 불명확해질 수 있다.
- Decision Outcome: `add-inbound-profile-migration` 하나가 이 행동 계약을 소유하고, `PROD-743`이 구현·단위/통합 검증·최종 정합성 확인과 archive를 소유한다. tasks는 구현 의존 순서를 보이되 별도 issue나 독립 OpenSpec lifecycle을 만들지 않는다.
- Alternatives Considered: UI·API·federation·Follow를 각각 별도 change로 나누는 방식은 현재 독립 전달 결과나 별도 rollout 결정이 없어 계약을 복제한다. 저장 구조만 소유하는 별도 spec-only issue도 현재 Issue Gate가 승인한 단일 결과와 맞지 않아 선택하지 않는다.
- Consequences: 각 task는 자기 실행 증거를 남기고, 개별 구현 완료만으로 change를 archive하지 않는다. 전체 흐름과 delta spec 정합성을 `PROD-743`이 마지막에 확인한다.
- Confirmation / Follow-up: `tasks.md`의 단계별 검증과 최종 strict validation, canonical·Linear 정합성 확인으로 검증한다.

### Profile Migration은 Local target과 Remote source 사이의 1:1 준비 관계다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`
- Status: Active
- Context / Problem: source와 target을 별도 입력 목록이나 전역 migration history로 다루면 같은 identity가 여러 target으로 연결되고 준비와 실제 Move 완료를 혼동할 수 있다.
- Decision Outcome: 준비 관계는 Local Profile target → Remote Profile source 방향이며 target 하나와 source 하나가 각각 하나의 관계만 가진다. source를 먼저 Remote Profile로 materialize하고, 같은 pair는 no-op, 다른 pair와의 충돌은 거부한다. 관계 자체는 inbound Move 완료나 전체 Profile 이전 이력이 아니다.
- Alternatives Considered: source·target 선택을 다대다 관계로 허용하면 이번에 승인된 target당 source 하나·source당 target 하나 범위를 넘어선다. 전역 migration registry나 관계가 없는 별도 source 속성은 준비 관계와 실제 Move 결과·alias의 책임을 넓히므로 이번 범위에서 선택하지 않는다.
- Consequences: 저장 경계는 pair uniqueness와 기존 Profile identity를 보존해야 하며, source materialization 실패나 준비 충돌은 기존 관계를 변경하지 않는다.
- Confirmation / Follow-up: eligible target, source materialization, same-pair no-op, target/source 양쪽 충돌을 실행 결과로 확인한다.

### Local Actor alias는 준비 관계의 canonical source URI에서만 파생한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`
- Status: Active
- Context / Problem: 사용자가 입력한 handle이나 client cache를 `alsoKnownAs`에 직접 넣으면 Actor identity와 Profile Migration 관계가 서로 다른 source를 가리킬 수 있다.
- Decision Outcome: Local Actor의 `alsoKnownAs` migration alias는 준비 관계가 가리키는 Remote source의 검증된 canonical Actor URI에서만 계산한다. aliases를 독립 Profile 속성이나 사용자 입력으로 관리하지 않는다.
- Alternatives Considered: 원본 qualified handle 문자열을 보존하는 방식은 canonical actor URI와 다를 수 있다. 별도 aliases 저장 field나 client-supplied alias는 source 관계와의 drift를 만들므로 선택하지 않는다.
- Consequences: Actor 표현은 현재 관계와 source identity가 수렴한 결과를 사용하며, 관계가 없으면 migration alias를 내보내지 않는다. source 표현 freshness의 별도 TTL이나 alias registry는 이번 범위에서 정하지 않는다.
- Confirmation / Follow-up: 준비 관계가 있는 Local Actor의 exact alias, 관계가 없는 Actor의 alias 부재와 사용자 입력 무시를 확인한다.

### inbound Move는 canonical identity와 exact alias를 검증하고 두 target origin을 지원한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`
- Status: Active
- Context / Problem: actor와 object가 다른 Move 또는 target alias가 맞지 않는 Move를 수용하면 임의 source가 Profile과 Follow state를 변경할 수 있다. 반대로 Local target 준비 관계만 요구하면 remote-to-remote 이전 계약을 잃는다.
- Decision Outcome: 인증된 actor와 object가 같은 canonical source URI이고 target canonical Actor의 `alsoKnownAs`에 exact source URI가 있을 때만 Move를 처리한다. source는 Remote Profile이어야 하며, 기존 지원 Actor 종류를 사용한다. remote-to-local은 이미 준비된 Local target과 Open policy를 사용하고, remote-to-remote는 사전 Local 준비 없이 target Remote Profile의 기존 policy를 사용한다. 저장되지 않은 source는 검증 뒤 Remote Profile로 materialize한다.
- Alternatives Considered: actor/object 중 하나만 검증하는 방식은 source spoofing을 허용한다. target을 문자열 handle로만 해석하거나 `Person`만 허용하는 방식은 canonical identity와 기존 Actor 종류 계약을 좁힌다. remote-to-remote에도 Local 준비를 강제하는 방식은 ADR 0027과 Issue 범위를 벗어난다.
- Consequences: invalid Move는 기존 준비 관계와 Follow state를 변경하지 않고, target origin별 policy admission만 분기한다. outbound Kosmo Move는 이 change의 결과가 아니다.
- Confirmation / Follow-up: actor/object mismatch, missing exact alias, valid local/remote targets, non-Person supported Actor type와 unknown-source materialization을 실행 검증한다.

### Local follower의 source 관계는 target 상태를 먼저 확정한 뒤 제거한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`
- Status: Active
- Context / Problem: source Follow Relationship을 먼저 제거하면 target 저장 실패나 처리 중단에서 Local follower를 잃을 수 있다.
- Decision Outcome: source를 Followee로 가진 established Follow 중 Local Profile Follower만 대상에 포함한다. target policy가 Open이면 기존 Follow Relationship과 그 Local-to-Remote effect semantics를, Approval Required이면 기존 Follow Request lifecycle을 먼저 성공시킨 뒤 source 관계를 기존 removal/Unfollow·Undo lifecycle로 제거한다. target 저장이 실패하면 source 관계를 유지한다. 이 순서는 remote-to-local과 remote-to-remote에 같고 Move 완료를 HTTP receipt 도착에 묶지 않는다.
- Alternatives Considered: source를 먼저 삭제하는 방식은 실패 시 follower 손실을 허용한다. 모든 Follow/Request 또는 remote follower까지 이전하는 방식은 canonical의 Local established follower 범위를 확장한다. target과 source를 하나의 전역 transaction으로 강제하는 방식은 승인된 보장보다 구현 경계를 넓힌다.
- Consequences: target 저장과 source 제거는 재시작 가능한 순서를 가져야 한다. Remote target의 Open policy도 기존 Local-to-Remote Follow effect를 사용하며 HTTP receipt은 source 제거의 별도 조건이 아니다. 이미 존재하는 target Follow/Request는 기존 lifecycle의 멱등성으로 처리하고, Local이 아닌 follower와 pending/non-established 관계는 이전하지 않는다.
- Confirmation / Follow-up: Open·Approval Required target, non-Local/non-established 제외, target failure source 보존, 기존 target row 재실행과 source 제거 재개를 통합 검증한다.

### 반복·중단은 기존 Follow lifecycle과 Temporal 재시도로 수렴한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`
- Status: Active
- Context / Problem: 현재 Follow pair Workflow의 PENDING·terminal command는 새 동일 command를 무조건 성공시키지 않으므로, 재시도 시 기존 target 상태를 확인하고 source 제거를 재개하는 경계가 필요하다.
- Decision Outcome: 같은 Move의 반복과 target 저장 뒤 중단은 기존 Profile identity와 Follow/Follow Request lifecycle의 idempotency 및 Temporal retry로 수렴한다. 기존 target Follow/Request가 이미 확정됐으면 중복 row를 만들지 않고 source 제거 재개를 허용한다. 서버 간 receipt 순서와 동시 Follow/Unfollow race는 보장하지 않는다.
- Alternatives Considered: 새 operation receipt, migration ledger, 전역 receipt 정렬 또는 race 잠금은 현재 승인된 보장보다 넓은 구현 선택이므로 채택하지 않는다. PENDING·terminal 재시도에서 source를 먼저 삭제하는 방식은 target-first 계약을 깨뜨린다.
- Consequences: 구현은 existing target state를 확인한 뒤 source cleanup을 재개해야 하고, 기존 Follow pair command sequence를 변경하는 경우 replay·배포 호환성 검증이 필요하다. out-of-order receipt와 Follow/Unfollow race 결과는 제품 보장으로 해석하지 않는다.
- Confirmation / Follow-up: PENDING/terminal 재실행, target-first 중단·재개, duplicate Move와 기존 target state를 확인한다. command sequence를 바꾸는 경우에만 history replay·배포 호환성을 검증한다.

### Settings feature flag는 source 준비 UI만 제어한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`
- Status: Active
- Context / Problem: source 준비 UI의 점진적 rollout 조건을 Profile 권한이나 이미 준비된 federation 동작의 runtime gate로 사용하면 flag 상태가 기능 보안 경계와 lifecycle을 오염시킨다.
- Decision Outcome: Profile detail은 해당 flag가 켜져 있고 값이 확인된 경우에만 source 준비 control을 노출한다. flag가 꺼져 있거나 확인 불가·로딩이면 control을 숨긴다. 실제 action은 기존 `Account.Active`·`Profile.Owner`를 검증하며, flag 상태로 준비 관계·alias·inbound Move를 제거하거나 중단하지 않는다. 구체 flag key와 시각 세부는 고정하지 않는다.
- Alternatives Considered: 운영자 CLI나 flag 관리 UI를 추가하는 방식은 Issue의 사용자 Settings 범위와 다르다. flag를 authorization token 또는 inbound processing gate로 사용하는 방식은 canonical security·runtime 경계를 위반한다. 로딩 중 control을 먼저 표시하는 방식은 확인되지 않은 rollout 상태를 노출한다.
- Consequences: UI는 flag 미확인 상태를 숨김으로 처리하고 기존 Profile error/loading 상태와 분리한다. flag OFF 뒤에도 이미 준비된 관계, alias, inbound Move 처리 결과는 보존된다.
- Confirmation / Follow-up: flag ON/OFF/unknown/loading 화면, non-owner action 거부, 준비 관계 뒤 flag OFF에서 alias·Move 유지와 입력 실패 시 UI 상태를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
