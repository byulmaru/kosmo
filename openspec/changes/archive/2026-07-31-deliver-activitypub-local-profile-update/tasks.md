## 1. PROD-629 Profile update change 판정과 post-commit lifecycle

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/architecture/core-services.md`
- `PROD-629`

**Deliverable**

Local Profile의 canonical actor 표현이 실제로 바뀐 commit만 one-shot post-commit lifecycle을 반환하고, transaction
owner가 outer commit 뒤 안전하게 실행할 수 있다.

**Guardrails**

- transaction 인자 존재 여부로 lifecycle을 선택하거나 생략하지 않는다.
- normalized current value와 avatar/header relation을 기준으로 actual change를 판정한다.
- Profile Tag 전용 변경, same-value, omitted input, validation 실패와 rollback은 Update delivery를 만들지 않는다.
- remote I/O를 Profile update transaction 안에서 실행하지 않는다.

**Verification**

- scalar·policy·Media 교체/제거, same-value·Tag-only·no-op, validation/rollback과 caller-owned transaction을 core
  service test로 검증한다.
- repeated/concurrent `postCommit()`이 같은 Promise와 단일 실행을 유지하는지 확인한다.

- [x] 1.1 Profile scalar와 avatar/header 관계의 write 전 current value를 기준으로 federation-visible actual change를 판정한다.
- [x] 1.2 Profile update 결과가 transaction 유무와 독립적인 no-op 또는 one-shot post-commit lifecycle을 제공하게 한다.
- [x] 1.3 actual change·no-op·Tag-only·rollback·caller-owned transaction과 lifecycle 반복 호출을 core test로 검증한다.

## 2. PROD-629 Canonical Update(Person) remote follower delivery

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/architecture/core-services.md`
- `PROD-512`
- `PROD-628`
- `PROD-629`

**Deliverable**

committed Local Profile actor 표현 변경이 unique ActivityPub `Update`와 최신 canonical embedded `Person`으로
usable established remote followers에게 전달된다.

**Guardrails**

- Update actor와 embedded object ID는 같은 stable local actor identity를 사용한다.
- embedded object는 PROD-628의 canonical Fedify `Person` projection을 재사용한다.
- 각 actual update lifecycle은 remote deduplication과 충돌하지 않는 새로운 activity IRI를 사용한다.
- followers audience와 recipient expansion은 공통 outbound dispatcher를 사용한다.
- follower 없음은 remote HTTP no-op이며 Profile update를 실패시키지 않는다.
- Profile Tag·Link, actor Delete와 durable outbox 범위를 추가하지 않는다.

**Verification**

- Update identity, audience, scalar·avatar/header·policy projection과 서로 다른 update ID를 Fedify test로 검증한다.
- active/unavailable follower, follower 없음, actor/shared inbox 중복과 delivery failure를 실제 dispatcher 경계에서
  확인한다.

- [x] 2.1 committed Local Profile을 최신 canonical `Person`으로 투영하고 unique `Update(Person)` activity를 구성한다.
- [x] 2.2 공통 recipient dispatcher를 통해 established active ActivityPub remote followers에게 전달한다.
- [x] 2.3 identity·audience·projection·unique ID와 follower eligibility·중복·empty·failure 경로를 Fedify test로 검증한다.

## 3. PROD-629 GraphQL 연결, 실패 격리와 완료 검증

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-448`
- `PROD-629`

**Deliverable**

GraphQL Profile update가 commit 뒤 lifecycle을 실행하고 direct delivery 실패에도 기존 성공 payload를 유지하며,
구현과 active OpenSpec 계약이 동기화된다.

**Guardrails**

- GraphQL schema와 Profile 편집 UI를 변경하지 않는다.
- projection/delivery 실패는 Profile ID와 오류를 관측 가능하게 남기고 committed result를 실패로 바꾸지 않는다.
- process 종료 유실, retry, ordering과 delivery history를 보장하지 않는다.
- 전체 task와 검증이 완료되기 전에는 change를 archive하지 않는다.

**Verification**

- GraphQL 성공 payload, no-op과 injected delivery failure를 API integration test로 검증한다.
- core/API/fedify test, typecheck/lint/formatting과 OpenSpec strict validation을 통과한다.
- delta spec을 active spec에 동기화하고 archive 후 strict validation을 다시 확인한다.

- [x] 3.1 GraphQL update entry가 commit된 core 결과의 post-commit lifecycle을 실행하고 기존 payload shape를 유지하게 한다.
- [x] 3.2 delivery failure가 committed Profile과 GraphQL 성공을 바꾸지 않고 관측되는지 통합 검증한다.
- [x] 3.3 관련 core/API/fedify test와 typecheck·lint·formatting 검사를 통과시킨다.
- [x] 3.4 OpenSpec strict validation과 diff를 검토하고 전체 task 완료 뒤 active spec 동기화·archive를 수행한다.
