## Context

PROD-629와 canonical Profile/core service 계약을 ActivityPub Local Profile Update delivery spec과 구현 경계로
번역한다. PROD-628의 canonical `Person`, PROD-512의 recipient dispatcher와 현재 Reaction post-commit 선례를
함께 적용한다.

## Decision Records

### 실제 canonical actor 표현 변경만 Update lifecycle을 만든다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-629`
- Status: Active
- Context / Problem: update input이 존재하거나 SQL UPDATE가 실행됐다는 사실만으로는 원격 actor 표현이 달라졌다고
  볼 수 없다. 같은 값 재저장과 Profile Tag 전용 변경은 canonical `Person`을 바꾸지 않는다.
- Decision Outcome: 정규화된 displayName/bio, Follow Approval Policy와 avatar/header Media relation의 write 전
  current value를 비교해 하나라도 달라질 때만 Update lifecycle을 만든다.
- Alternatives Considered: input field 존재, UPDATE row count 또는 모든 Profile edit를 trigger로 사용. no-op과
  projection 비대상 변경까지 불필요한 Update를 만들므로 채택하지 않는다.
- Consequences: 실제 actor 표현 변경과 delivery lifecycle이 일치한다. change 판정은 같은 Profile update
  transaction 안에서 수행해야 한다.
- Confirmation / Follow-up: scalar·Media 교체/제거, same-value, omitted, Tag-only와 rollback test로 검증한다.

### Profile update는 명시적 one-shot post-commit lifecycle을 반환한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-629`
- Status: Active
- Context / Problem: caller-owned transaction에는 after-commit hook이 없으며 `tx` 유무로 lifecycle을 생략하면 같은
  domain action이 caller에 따라 다른 결과를 만든다. transaction 안에서 delivery하면 rollback된 변경이 외부로
  나갈 수 있다.
- Decision Outcome: `updateProfile`은 Profile과 동일 Promise를 재사용하는 `postCommit()` lifecycle을 함께
  반환한다. transaction 유무와 무관하게 actual change가 lifecycle을 결정하며 transaction owner가 outer commit 뒤
  실행한다.
- Alternatives Considered: `tx`가 없을 때만 core 내부 delivery, transaction 안 direct delivery, optional callback
  injection. 각각 caller-owned lifecycle 누락, rollback 외부 노출 또는 필수 lifecycle 우회 가능한 public contract를
  만들므로 채택하지 않는다.
- Consequences: GraphQL resolver가 lifecycle을 명시적으로 실행해야 하며 다른 caller transaction도 commit 조정을
  소유한다. repeated call은 추가 delivery를 시작하지 않는다.
- Confirmation / Follow-up: top-level/outer transaction, rollback, repeated/concurrent invocation과 delivery failure
  test로 검증한다.

### Embedded Person은 canonical Local actor projection을 재사용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-628`, `PROD-629`
- Status: Active
- Context / Problem: actor dispatcher와 outbound Update가 별도 object serializer를 가지면 optional 이미지, follow
  policy, identity와 key 표현이 갈라질 수 있다.
- Decision Outcome: Update delivery 시점에 committed DB 상태를 다시 읽고 PROD-628의 Fedify `Person` projection
  경계를 재사용한다. Update actor, embedded object ID와 followers audience는 같은 local actor identity에서 만든다.
- Alternatives Considered: update transaction input으로 inline JSON 생성, Update 전용 `Person` projection. 최신
  committed state와 actor 역참조의 단일 표현 계약을 깨므로 채택하지 않는다.
- Consequences: 연속 edit가 있으면 delivery 시작 시점의 최신 actor 표현을 전달할 수 있다. key lazy 생성과 endpoint
  identity도 기존 경계를 따른다.
- Confirmation / Follow-up: actor/object identity, scalar·Media·policy와 key/endpoint 회귀를 Fedify test로 검증한다.

### Profile Update activity마다 새로운 IRI를 사용한다

- Decision Date: 2026-07-31
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-629`
- Status: Active
- Context / Problem: 하나의 Local Profile은 여러 번 변경될 수 있다. 고정된 `#update` IRI를 반복 사용하면 remote
  server가 이후 Update를 이미 처리한 activity로 중복 제거할 수 있다.
- Decision Outcome: actual Profile update lifecycle마다 actor URI 아래 UUID를 포함한 새로운 Update activity IRI를
  만들고, 같은 one-shot lifecycle의 반복 호출에서는 처음 만든 activity와 실행 Promise를 재사용한다.
- Alternatives Considered: actor별 고정 Update IRI, wall-clock timestamp, 별도 durable activity row. 고정 IRI는
  remote deduplication 충돌이 있고 timestamp는 동시성 identity로 불충분하며 durable row는 PROD-448 범위를
  선행 구현하므로 채택하지 않는다.
- Consequences: direct delivery의 각 update event는 구분되지만 activity 역참조와 durable retry identity는 제공하지
  않는다. UUID는 domain row나 GraphQL contract에 저장하지 않는다.
- Confirmation / Follow-up: 서로 다른 update 결과의 activity ID 차이와 동일 lifecycle repeated call 단일 delivery를
  검증한다.

### Direct delivery failure와 유실 창을 committed Profile에서 격리한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-448`, `PROD-629`
- Status: Active
- Context / Problem: remote HTTP 실패는 이미 commit된 Profile을 rollback할 수 없고, 현재 direct delivery에는
  durable intent가 없다.
- Decision Outcome: projection/delivery failure를 Profile ID와 함께 기록하고 post-commit lifecycle은 성공적으로
  resolve해 GraphQL 결과를 유지한다. process 종료·retry·ordering 보장은 제공하지 않는다.
- Alternatives Considered: GraphQL failure 반환, 보상 rollback, PROD-448 완료까지 기능 보류. commit된 상태와 응답
  불일치 또는 독립 delivery slice 지연을 만들므로 채택하지 않는다.
- Consequences: 원격 서버가 일부 Update를 놓칠 수 있으며 actor 재조회 전까지 stale 표현을 유지할 수 있다.
  durable 보장은 PROD-448로 남는다.
- Confirmation / Follow-up: follower 없음, remote failure와 committed GraphQL payload 유지 test로 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
