## MODIFIED Requirements

### Requirement: 일반 Local Post Create delivery

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/architecture/core-services.md`, `PROD-494`, `PROD-512`, `PROD-722`. 기존 Post transaction이 실제 commit된 `origin: LOCAL` content Post에 대해 시스템은 Post ID 기반 effects Workflow 시작을 시도해야 한다(MUST). 시작이 수락되면 Workflow Activity가 PROD-494의 canonical Local Note identity와 표현을 사용하는 일반 ActivityPub `Create(Note)`를 구성해 공통 outbound dispatcher에 전달해야 한다(MUST). Reply 전용 Create builder나 delivery helper를 만들어서는 안 된다(MUST NOT). `origin: ACTIVITYPUB`인 Post 결과는 inbound Activity의 outbound echo를 만들거나 dispatcher에 전달해서는 안 된다(MUST NOT).

#### Scenario: Root Post 생성

- **WHEN** `origin: LOCAL`인 Local Profile의 Content가 있는 Root Post transaction이 실제 commit되고 Post ID 기반 effects Workflow 시작이 수락된다
- **THEN** effects Workflow Activity는 canonical Local Note를 포함한 `Create(Note)`를 구성한다
- **AND** Note는 `inReplyTo`를 포함하지 않는다
- **AND** Author followers를 논리적 target으로 dispatcher에 전달한다

#### Scenario: Local Parent Reply 생성

- **WHEN** `origin: LOCAL`인 Local Profile이 Content가 있는 Local Post를 Parent로 참조하는 Reply transaction을 commit하고 Post ID 기반 effects Workflow 시작이 수락된다
- **THEN** effects Workflow Activity는 Root Post와 같은 Create builder를 사용한다
- **AND** Note의 `inReplyTo`는 Parent의 canonical Local Note URI다
- **AND** Parent author direct target을 추가하지 않는다

#### Scenario: Remote Parent Reply 생성

- **WHEN** `origin: LOCAL`인 Local Profile이 저장된 remote Post를 Parent로 참조하는 Public 또는 Unlisted Reply transaction을 commit하고 Post ID 기반 effects Workflow 시작이 수락된다
- **THEN** effects Workflow Activity는 Root Post와 같은 Create builder를 사용한다
- **AND** Note의 `inReplyTo`는 Parent의 기존 ActivityPub Post URI다
- **AND** Author followers와 remote Parent author Profile을 논리적 target으로 dispatcher에 전달한다

#### Scenario: ActivityPub origin echo suppression

- **WHEN** ActivityPub ingress가 `origin: ACTIVITYPUB`인 Post transaction을 실제 commit하고 Post ID 기반 effects Workflow 시작을 시도한다
- **THEN** 시스템은 해당 Post result를 위한 outbound Local Post `Create`를 구성하거나 dispatcher에 전달하지 않는다
- **AND** inbound Activity acknowledgement는 기존 committed Post 결과를 따른다

### Requirement: Post lifecycle과 delivery failure isolation

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/architecture/core-services.md`, `PROD-447`, `PROD-448`, `PROD-512`, `PROD-533`, `PROD-722`. 기존 `createPost` transaction은 Local content Post lifecycle을 소유하고(MUST), API resolver나 ActivityPub handler가 Post와 후속 delivery lifecycle을 직접 조립해서는 안 된다(MUST NOT). 실제 commit 뒤 Post ID 기반 effects Workflow 시작을 시도하고, 시작이 수락된 Local-origin Create의 queue handoff는 그 Workflow Activity가 소유해야 한다(MUST). Workflow 시작 gap/failure와 handoff 실패는 committed application 결과와 격리해 관측해야 한다(MUST). 기존 Local Post Delete의 commit·dispatcher 계약은 이 Create 전환으로 변경하지 않는다.

#### Scenario: Local Create effects Workflow 시작 gap 또는 실패

- **WHEN** `origin: LOCAL`인 Post transaction이 실제 commit됐지만 Post ID 기반 effects Workflow가 시작되기 전에 process가 종료되거나 start 요청이 수락되지 않는다
- **THEN** 시스템은 Post identity와 감지된 start failure를 관측한다
- **AND** committed Post·Content 결과를 유지한다
- **AND** Local ingress는 committed 결과를 나타내는 성공 결과를 유지하며 Create delivery가 유실될 수 있는 경계를 허용한다

#### Scenario: Local Create handoff 실패

- **WHEN** `origin: LOCAL`인 Post transaction이 실제 commit되고 effects Workflow 시작이 수락된 뒤 Workflow Activity의 Fedify queue handoff가 실패한다
- **THEN** 시스템은 Post identity와 handoff 실패를 관측 가능하게 기록한다
- **AND** committed Post·Content 결과를 유지한다
- **AND** effects Workflow Activity는 같은 stable activity identity로 handoff를 재시도할 수 있다

#### Scenario: ActivityPub origin의 후속 delivery 없음

- **WHEN** `origin: ACTIVITYPUB`인 Post transaction이 실제 commit된다
- **THEN** accepted effects Workflow는 Local Create queue handoff Activity를 예약하거나 그 실패를 재시도하지 않는다
- **AND** inbound Activity 처리 결과는 committed Post 결과와 독립적으로 outbound echo를 만들지 않는다

#### Scenario: Local Delete handoff 실패

- **WHEN** 기존 Local Post Delete transaction이 commit된 뒤 Fedify queue handoff가 실패한다
- **THEN** 시스템은 Post identity와 handoff 실패를 관측 가능하게 기록한다
- **AND** committed Tombstone 결과를 유지한다
- **AND** 기존 Delete action은 committed 결과를 나타내는 성공 결과를 반환한다

#### Scenario: transaction rollback

- **WHEN** Local Post Create 또는 Delete transaction이 rollback된다
- **THEN** 시스템은 해당 state transition의 Create 또는 Delete Activity를 queue에 handoff하거나 외부에 전달하지 않는다
- **AND** Post ID 기반 Create effects Workflow 시작을 시도하지 않는다

### Requirement: 현재 direct delivery 제한

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `PROD-448`, `PROD-512`, `PROD-533`, `PROD-722`. queue producer mode가 활성화된 runtime에서 `origin: LOCAL`인 Post Create는 실제 commit 뒤 시작이 수락된 Post ID 기반 effects Workflow Activity를 통해 Fedify PostgreSQL MessageQueue에 handoff해야 하고 remote HTTP delivery를 요청 process에서 직접 실행해서는 안 된다(MUST NOT). `origin: ACTIVITYPUB`인 Post Create는 outbound queue message와 remote HTTP delivery를 만들지 않아야 한다(MUST NOT). 이 capability는 Workflow start gap을 보완하기 위한 transactional domain outbox/relay, delivery history 또는 사용자용 delivery status를 추가해서는 안 된다(MUST NOT). 시작이 수락된 뒤 effects Workflow의 retry 경계는 Fedify MessageQueue consumer의 dequeue·remote delivery retry와 결합하지 않는다(MUST NOT).

#### Scenario: commit 뒤 Workflow start 전 process 종료

- **WHEN** `origin: LOCAL`인 Post state가 실제 commit된 뒤 Post ID 기반 effects Workflow start 전에 process가 종료된다
- **THEN** committed Post state는 유지된다
- **AND** Create delivery가 유실될 수 있는 start gap을 허용하고 감지된 failure를 관측한다
- **AND** 시스템은 transactional domain outbox, custom relay 또는 별도 delivery history를 추가하지 않는다

#### Scenario: ActivityPub origin의 queue 비생성

- **WHEN** `origin: ACTIVITYPUB`인 Post transaction이 commit되고 Post ID 기반 effects Workflow 시작이 시도된다
- **THEN** 시스템은 Local Post Create를 Fedify PostgreSQL MessageQueue에 handoff하지 않는다
- **AND** producer는 inbound Activity의 remote HTTP delivery를 직접 실행하거나 재시도하지 않는다

#### Scenario: handoff 수락 뒤 process 종료

- **WHEN** Fedify PostgreSQL queue가 Local-origin Create 또는 기존 Delete를 수락한 뒤 producer process가 종료된다
- **THEN** 수락된 message는 별도 Fedify consumer가 다시 처리할 수 있다
- **AND** producer 또는 effects Workflow는 remote HTTP delivery를 직접 재시도하지 않는다
