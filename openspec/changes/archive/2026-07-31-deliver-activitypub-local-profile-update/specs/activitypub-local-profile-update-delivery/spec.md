## ADDED Requirements

### Requirement: Federation-visible Profile 변경 판정

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`, `PROD-629`; MUST 준수한다.

시스템은 Local Profile update가 canonical ActivityPub actor 표현을 실제로 변경한 경우에만 outbound Profile
Update lifecycle을 만드는 것을 MUST 보장한다.

#### Scenario: Scalar actor 표현 변경

- **WHEN** Local Profile의 displayName, bio 또는 Follow Approval Policy가 저장된 현재 값과 다른 값으로 commit된다
- **THEN** 시스템은 해당 Profile을 위한 outbound Update lifecycle을 만든다

#### Scenario: Avatar 또는 header 관계 변경

- **WHEN** Local Profile의 avatar 또는 header Media 관계가 다른 Ready Local Media로 교체되거나 제거되어 commit된다
- **THEN** 시스템은 해당 Profile을 위한 outbound Update lifecycle을 만든다

#### Scenario: Actor 표현 no-op

- **WHEN** 요청된 displayName, bio, Follow Approval Policy, avatar와 header가 저장된 actor 표현과 모두 같다
- **THEN** 시스템은 outbound Update lifecycle을 만들지 않는다
- **AND** 같은 값의 명시적 입력과 생략된 입력을 delivery 관점에서 동일한 no-op으로 취급한다

#### Scenario: Projection 비대상 변경

- **WHEN** Profile Tag처럼 현재 canonical actor projection에 포함되지 않는 값만 commit된다
- **THEN** 시스템은 outbound Update lifecycle을 만들지 않는다

### Requirement: Commit 이후 Profile Update lifecycle

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-629`; 이 요구사항을 MUST 준수한다.

시스템은 Profile 변경 transaction이 성공적으로 commit된 뒤에만 outbound ActivityPub Profile Update를 실행하고,
caller-owned transaction에서도 lifecycle을 생략하거나 outer commit 전에 원격 I/O를 수행하지 않는 것을 MUST
보장한다.

#### Scenario: Top-level Profile update commit

- **WHEN** application이 별도 caller transaction 없이 federation-visible Local Profile 변경을 commit한다
- **THEN** action은 commit된 결과와 실행 가능한 post-commit lifecycle을 반환한다
- **AND** GraphQL entry는 mutation 결과를 반환하기 전에 그 lifecycle을 실행한다

#### Scenario: Caller-owned transaction commit

- **WHEN** application이 caller-owned transaction 안에서 federation-visible Local Profile 변경을 수행한다
- **THEN** action은 transaction 존재 여부와 무관하게 같은 post-commit lifecycle을 반환한다
- **AND** transaction owner는 outer commit이 성공한 뒤 lifecycle을 실행한다
- **AND** outer commit 전에는 Fedify delivery 또는 remote HTTP I/O를 수행하지 않는다

#### Scenario: Validation failure 또는 rollback

- **WHEN** Profile update가 validation·authorization 실패로 거부되거나 포함된 transaction이 rollback된다
- **THEN** 시스템은 해당 미반영 변경을 위한 ActivityPub Update를 만들거나 전달하지 않는다

#### Scenario: Repeated lifecycle invocation

- **WHEN** 같은 action 결과의 post-commit lifecycle을 반복 또는 동시에 호출한다
- **THEN** 시스템은 같은 실행 Promise를 재사용한다
- **AND** 그 action 결과를 위한 direct delivery를 둘 이상 시작하지 않는다

### Requirement: Canonical Update Person projection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-628`, `PROD-629`; 이 요구사항을 MUST 준수한다.

시스템은 committed Local Profile의 stable actor identity와 canonical `Person` projection을 재사용한
ActivityPub `Update(Person)`을 구성하는 것을 MUST 보장한다.

#### Scenario: Construct Local Profile Update

- **WHEN** federation-visible Local Profile 변경의 post-commit lifecycle이 실행된다
- **THEN** `Update.actor`는 변경된 Profile의 canonical local actor URI다
- **AND** embedded `Update.object`는 PROD-628의 canonical `Person` projection이다
- **AND** embedded `Person.id`는 `Update.actor`와 같다
- **AND** Update는 해당 actor의 followers collection을 audience로 표현한다

#### Scenario: Preserve latest committed representation

- **WHEN** displayName, bio, avatar, header 또는 Follow Approval Policy 변경 뒤 Update를 구성한다
- **THEN** embedded `Person`은 delivery 시점의 최신 committed Profile/Media 표현을 사용한다
- **AND** actor dispatcher와 다른 전용 JSON projection을 만들지 않는다
- **AND** actor key identity, inbox/outbox, followers/following과 shared inbox identity를 변경하지 않는다

### Requirement: Remote follower direct delivery

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`, `PROD-512`, `PROD-629`; MUST 준수한다.

시스템은 Local Profile Update를 공통 outbound recipient dispatcher를 통해 usable established ActivityPub remote
followers에게 직접 전달하고, follower 부재와 delivery 실패를 committed Profile 결과에서 격리하는 것을 MUST
보장한다.

#### Scenario: Deliver to active remote followers

- **WHEN** 변경된 Local Profile에 usable established ActivityPub remote follower가 있다
- **THEN** 시스템은 공통 recipient dispatcher로 같은 Update activity를 전달한다
- **AND** 동일 actor는 한 recipient로 중복 제거한다
- **AND** 유효한 shared inbox가 있으면 Fedify shared inbox preference를 적용한다

#### Scenario: No remote followers

- **WHEN** 변경된 Local Profile에 usable established ActivityPub remote follower가 없다
- **THEN** 시스템은 remote HTTP delivery를 호출하지 않는다
- **AND** committed Profile update를 성공 결과로 유지한다

#### Scenario: Delivery failure isolation

- **WHEN** commit 이후 Update projection 또는 remote delivery가 실패한다
- **THEN** 시스템은 Profile ID와 오류를 post-commit 관측 경계에 기록한다
- **AND** committed Profile과 GraphQL mutation 성공 결과를 rollback하거나 실패로 바꾸지 않는다

#### Scenario: Accepted direct-delivery loss window

- **WHEN** application process가 Profile commit 이후 direct delivery 시작 또는 완료 전에 종료된다
- **THEN** 이번 capability는 durable intent, retry 또는 delivery history를 보장하지 않는다
- **AND** 해당 보장은 PROD-448의 transactional outbox와 worker 범위에 남는다
