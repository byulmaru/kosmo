## ADDED Requirements

### Requirement: Fedify follow protocol boundary

시스템은 ActivityPub follow protocol 처리에서 Fedify가 제공하는 inbox, signature, key, send, queue 기능을 재사용해야 한다(MUST).

#### Scenario: Use Fedify for outbound follow activities

- **WHEN** 시스템이 remote actor로 Follow 또는 Undo(Follow)를 발송한다
- **THEN** 시스템은 Fedify `sendActivity`를 사용한다
- **AND** 시스템은 HTTP signature, delivery retry, queue를 직접 구현하지 않는다

#### Scenario: Use Fedify for inbound follow activities

- **WHEN** remote actor가 local actor inbox로 Follow, Undo, Accept, Reject activity를 보낸다
- **THEN** Fedify inbox listener는 verified typed activity를 kosmo follow handler에 전달한다
- **AND** 시스템은 request parsing, signature verification, remote actor key verification을 직접 구현하지 않는다

### Requirement: Outbound remote follow

시스템은 local profile이 remote ActivityPub profile을 follow하거나 unfollow할 수 있게 해야 한다(MUST).

#### Scenario: Follow active remote profile

- **WHEN** active local profile이 활성 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 local profile을 follower, remote profile을 followee로 하는 `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** 시스템은 Fedify `sendActivity`로 ActivityPub `Follow` activity를 발송한다
- **AND** remote actor의 Accept를 기다려야 하는 경우 follow 관계 상태는 `PENDING`이 될 수 있다

#### Scenario: Remote follow accepted

- **WHEN** remote actor가 local actor가 보낸 Follow에 대한 `Accept` activity를 보낸다
- **THEN** 시스템은 해당 outbound `ProfileFollow` 관계 상태를 `ACCEPTED`로 갱신한다
- **AND** `Accept.actor`는 해당 `ProfileFollow`의 remote followee actor URI와 일치해야 한다
- **AND** `Accept.object`는 해당 `ProfileFollow`에 연결된 outbound Follow activity identity를 참조해야 한다
- **AND** actor 또는 object가 일치하지 않는 `Accept`는 해당 follow 관계를 갱신하지 않는다

#### Scenario: Remote follow rejected

- **WHEN** remote actor가 local actor가 보낸 Follow에 대한 `Reject` activity를 보낸다
- **THEN** 시스템은 해당 outbound `ProfileFollow` 관계 상태를 `REJECTED`로 갱신한다
- **AND** `Reject.actor`는 해당 `ProfileFollow`의 remote followee actor URI와 일치해야 한다
- **AND** `Reject.object`는 해당 `ProfileFollow`에 연결된 outbound Follow activity identity를 참조해야 한다
- **AND** actor 또는 object가 일치하지 않는 `Reject`는 해당 follow 관계를 갱신하지 않는다

#### Scenario: Unfollow active remote profile

- **WHEN** active local profile이 follow 중인 활성 ActivityPub remote profile unfollow를 요청한다
- **THEN** 시스템은 해당 `ProfileFollow` 관계를 제거한다
- **AND** 시스템은 Fedify `sendActivity`로 기존 Follow에 대한 `Undo` activity를 발송한다

### Requirement: Inbound remote follow

시스템은 remote ActivityPub profile이 local profile을 follow하거나 unfollow할 수 있게 해야 한다(MUST).

#### Scenario: Receive remote Follow for local actor

- **WHEN** Fedify inbox listener가 verified remote `Follow` activity를 전달한다
- **THEN** 시스템은 remote actor를 `Profile`로 materialize하거나 기존 remote `Profile`을 조회한다
- **AND** 시스템은 remote profile을 follower, local profile을 followee로 하는 `ProfileFollow` 관계를 생성하거나 갱신한다
- **AND** local profile follow policy가 `OPEN`이면 follow 관계를 `ACCEPTED`로 만들고 `Accept` activity를 발송한다
- **AND** local profile follow policy가 `APPROVAL_REQUIRED`이면 follow 관계를 `PENDING`으로 둔다
- **AND** 이번 capability는 `APPROVAL_REQUIRED` inbound Follow에 대한 Accept 또는 Reject를 자동 발송하지 않는다
- **AND** `PENDING` remote follow request를 승인 또는 거절하고 그 결과 activity를 발송하는 UX는 후속 capability에서 다룬다

#### Scenario: Receive remote Undo Follow

- **WHEN** Fedify inbox listener가 verified remote `Undo(Follow)` activity를 전달한다
- **THEN** 시스템은 해당 remote follower와 local followee 사이의 `ProfileFollow` 관계를 제거한다
- **AND** 시스템은 같은 remote Undo를 idempotent하게 처리한다
- **AND** `Undo.actor`는 undo 대상 Follow의 actor 및 remote follower actor URI와 일치해야 한다
- **AND** actor 또는 object가 일치하지 않는 `Undo(Follow)`는 해당 follow 관계를 제거하지 않는다

#### Scenario: Reject unsupported inbox activity

- **WHEN** Fedify inbox listener가 follow graph에 필요한 ActivityPub activity가 아닌 verified activity를 전달한다
- **THEN** 시스템은 이번 capability에서 지원하지 않는 activity로 처리한다
- **AND** 시스템은 post delivery, mention, like, announce 같은 후속 activity를 처리하지 않는다
