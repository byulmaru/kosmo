# activitypub-local-profile-update-delivery Specification

## Purpose

Local Profile의 federation-visible 표현 변경을 commit 이후 canonical ActivityPub `Update(Person)`으로
active remote follower에게 전달하는 계약을 정의한다.

## Requirements

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

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-629`, `PROD-665` 시스템은 Profile 변경 transaction이 성공적으로 commit된 뒤에만 outbound ActivityPub Profile Update Effects Workflow를 시작해야 하고(MUST), Core action이 transaction과 Workflow start 시도를 소유해야 한다(MUST). Caller-owned database handle과 반환형 post-commit lifecycle을 사용해서는 안 된다(MUST NOT).

#### Scenario: Top-level Profile update commit

- **WHEN** application이 federation-visible Local Profile 변경을 commit한다
- **THEN** Core action은 commit된 Profile 결과를 반환한다
- **AND** 실제 actor-visible 변경이면 commit 뒤 Profile Update Effects Workflow start를 시도한다

#### Scenario: Validation failure 또는 rollback

- **WHEN** Profile update가 validation·authorization 실패로 거부되거나 transaction이 rollback된다
- **THEN** 시스템은 해당 미반영 변경을 위한 ActivityPub Update Workflow를 시작하지 않는다

#### Scenario: Caller-side lifecycle 제거

- **WHEN** GraphQL entry가 Profile update action을 호출한다
- **THEN** caller는 database handle을 전달하지 않는다
- **AND** caller는 별도 post-commit lifecycle을 받거나 실행하지 않는다

### Requirement: Canonical Update Person projection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-628`, `PROD-629`, `PROD-665` 시스템은 committed Local Profile의 stable actor identity와 canonical `Person` projection을 재사용한 ActivityPub `Update(Person)`을 구성해야 한다(MUST). 각 committed actor-visible 변경의 update identity는 해당 Workflow와 Activity retry에서 stable해야 한다(MUST).

#### Scenario: Construct Local Profile Update

- **WHEN** Profile Update Activity가 실행된다
- **THEN** `Update.actor`는 변경된 Profile의 canonical local actor URI다
- **AND** embedded `Update.object`는 PROD-628의 canonical `Person` projection이다
- **AND** embedded `Person.id`는 `Update.actor`와 같다
- **AND** Update는 해당 actor의 followers collection을 audience로 표현한다
- **AND** Update IRI는 Workflow input의 stable update identity를 사용한다

#### Scenario: Preserve latest committed representation

- **WHEN** displayName, bio, avatar, header 또는 Follow Approval Policy 변경 뒤 Update를 구성한다
- **THEN** embedded `Person`은 delivery 시점의 최신 committed Profile/Media 표현을 사용한다
- **AND** actor dispatcher와 다른 전용 JSON projection을 만들지 않는다
- **AND** actor key identity, inbox/outbox, followers/following과 shared inbox identity를 변경하지 않는다

### Requirement: Remote follower direct delivery

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`, `PROD-448`, `PROD-512`, `PROD-629`, `PROD-665` 시스템은 Local Profile Update를 공통 outbound recipient dispatcher를 통해 usable established ActivityPub remote followers 대상으로 Fedify PostgreSQL outbox/fan-out queue에 handoff해야 한다(MUST). Queue handoff 전 실패는 Temporal Activity retry가 소유하고(MUST), follower 부재와 Workflow start·Activity 실패는 committed Profile 결과에서 격리해야 한다(MUST).

#### Scenario: Deliver to active remote followers

- **WHEN** 변경된 Local Profile에 usable established ActivityPub remote follower가 있다
- **THEN** 시스템은 공통 recipient dispatcher로 같은 Update activity를 queue에 handoff한다
- **AND** 동일 actor는 한 recipient로 중복 제거한다
- **AND** 유효한 shared inbox가 있으면 Fedify shared inbox preference를 적용한다

#### Scenario: No remote followers

- **WHEN** 변경된 Local Profile에 usable established ActivityPub remote follower가 없다
- **THEN** 시스템은 queue handoff 또는 remote HTTP delivery를 호출하지 않는다
- **AND** committed Profile update를 성공 결과로 유지한다

#### Scenario: Delivery failure isolation

- **WHEN** commit 이후 Workflow start, Update projection 또는 queue handoff가 실패한다
- **THEN** 시스템은 Profile ID와 update identity와 함께 해당 경계의 오류를 관측한다
- **AND** committed Profile과 GraphQL mutation 성공 결과를 rollback하거나 실패로 바꾸지 않는다
- **AND** start가 수락된 Workflow의 projection 또는 queue handoff 실패는 Temporal Activity가 재시도한다
- **AND** handoff 수락 뒤 remote delivery retry와 최종 실패는 Fedify consumer가 관측한다

#### Scenario: Commit과 Workflow start 사이 loss window

- **WHEN** application process가 Profile commit 이후 Workflow start 수락 전에 종료된다
- **THEN** 이 capability는 transactional domain intent, relay, reconciliation 또는 delivery history를 보장하지 않는다
- **AND** committed Profile 결과는 유지된다

#### Scenario: Queue handoff 이후 producer 종료

- **WHEN** Fedify PostgreSQL queue가 Update를 수락한 뒤 producer process가 종료된다
- **THEN** 수락된 message는 별도 Fedify consumer가 처리할 수 있다
- **AND** producer는 remote delivery를 직접 재시도하지 않는다
