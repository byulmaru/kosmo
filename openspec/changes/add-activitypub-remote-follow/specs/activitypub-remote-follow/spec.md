## ADDED Requirements

### Requirement: Fedify follow protocol boundary

시스템은 ActivityPub follow protocol 처리에서 Fedify가 제공하는 inbox, signature, key, send, queue 기능을 재사용해야 한다(MUST).

#### Scenario: Use Fedify for outbound follow protocol activities

- **WHEN** 시스템이 remote actor로 Follow, Undo(Follow), Accept(Follow), 또는 Reject(Follow)를 발송한다
- **THEN** 시스템은 Fedify `sendActivity`를 사용한다
- **AND** 시스템은 HTTP signature, delivery retry, queue를 직접 구현하지 않는다

#### Scenario: Use Fedify for inbound follow activities

- **WHEN** remote actor가 local actor inbox로 Follow, Undo, Accept, Reject activity를 보낸다
- **THEN** Fedify inbox listener는 verified typed activity를 kosmo follow handler에 전달한다
- **AND** 시스템은 request parsing, signature verification, remote actor key verification을 직접 구현하지 않는다

#### Scenario: Materialize unknown remote actor through lookup

- **WHEN** follow protocol handler가 remote actor URI를 참조하지만 저장된 ActivityPub remote `Profile`이 없다
- **THEN** 시스템은 actor URI만으로 `Profile`을 생성하지 않는다
- **AND** 시스템은 Fedify가 해석한 remote actor 객체의 `preferredUsername`과 actor URI host로 candidate `acct:{preferredUsername}@{domain}`을 만들 수 있을 때만 `add-activitypub-remote-profile-federation`의 Fedify/WebFinger lookup 기반 materialization 경로를 수행한다
- **AND** WebFinger lookup 결과의 canonical actor URI는 inbound activity의 remote actor URI와 일치해야 한다
- **AND** candidate federated handle을 만들 수 없거나 lookup이 federated handle과 actor URI를 검증하지 못하면 `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하거나 갱신하지 않는다

### Requirement: Outbound remote follow

시스템은 local profile이 `followPolicy`가 `OPEN`인 remote ActivityPub profile을 follow하거나, 기존 remote ActivityPub follow 관계를 unfollow할 수 있게 해야 한다(MUST).

#### Scenario: Follow active remote profile

- **WHEN** active local profile이 `followPolicy`가 `OPEN`인 활성 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 local profile을 follower, remote profile을 followee로 하는 established `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** 새 `ProfileFollow` 관계가 생성된 경우에만 Fedify `sendActivity`로 ActivityPub `Follow` activity를 발송한다
- **AND** 새 logical outbound Follow activity의 id, actor URI, object URI, Fedify `orderingKey`는 후속 Accept/Reject/Undo correlation에 사용할 수 있도록 해당 `ProfileFollow`에 연결된다
- **AND** 기존 `ProfileFollow` 관계를 반환하는 idempotent 요청에서는 ActivityPub `Follow` activity를 다시 발송하지 않는다

#### Scenario: Remote follow accepted

- **WHEN** remote actor가 local actor가 보낸 Follow에 대한 `Accept` activity를 보낸다
- **THEN** 시스템은 해당 outbound Follow가 이미 established `ProfileFollow`로 투영되어 있으면 idempotent하게 처리한다
- **AND** `Accept.actor`는 해당 outbound Follow의 remote followee actor URI와 일치해야 한다
- **AND** `Accept.object`는 해당 outbound Follow activity identity를 참조해야 한다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 해당 outbound Follow의 local follower actor URI는 recipient actor URI와 일치해야 한다
- **AND** actor, object, 또는 recipient가 일치하지 않는 `Accept`는 local follow graph 또는 request를 갱신하지 않는다
- **AND** 이번 capability는 outbound `ProfileFollowRequest`를 만들지 않으므로, established `ProfileFollow` projection에 연결되지 않는 `Accept`는 follow graph 또는 request를 갱신하지 않는다

#### Scenario: Remote follow rejected

- **WHEN** remote actor가 local actor가 보낸 Follow에 대한 `Reject` activity를 보낸다
- **THEN** 시스템은 해당 outbound Follow가 established `ProfileFollow`로 투영되어 있으면 그 관계를 제거한다
- **AND** 시스템은 거절 상태 값을 저장하지 않는다
- **AND** `Reject.actor`는 해당 outbound Follow의 remote followee actor URI와 일치해야 한다
- **AND** `Reject.object`는 해당 outbound Follow activity identity를 참조해야 한다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 해당 outbound Follow의 local follower actor URI는 recipient actor URI와 일치해야 한다
- **AND** actor, object, 또는 recipient가 일치하지 않는 `Reject`는 local follow graph 또는 request를 갱신하지 않는다
- **AND** 이번 capability는 outbound `ProfileFollowRequest`를 만들지 않으므로, established `ProfileFollow` projection에 연결되지 않는 `Reject`는 follow graph 또는 request를 갱신하지 않는다

#### Scenario: Unfollow active remote profile

- **WHEN** active local profile이 `SUSPENDED` 또는 `UNRESPONSIVE`가 아닌 responsive instance에 속한 활성 ActivityPub remote profile unfollow를 요청한다
- **THEN** 시스템은 해당 `ProfileFollow` 관계를 제거한다
- **AND** 시스템은 Fedify `sendActivity`로 기존 Follow에 대한 `Undo` activity를 발송한다
- **AND** 시스템은 저장된 원본 Follow activity id, actor URI, object URI를 `Undo.object`의 대상 Follow에 사용한다
- **AND** 시스템은 원본 Follow와 후속 `Undo(Follow)`를 같은 Fedify `orderingKey`로 발송한다

### Requirement: Inbound remote follow

시스템은 remote ActivityPub profile이 local profile을 follow하거나 unfollow할 수 있게 해야 한다(MUST). Remote actor가 아직 저장되어 있지 않으면 시스템은 Fedify/WebFinger lookup 기반 materialization을 먼저 수행해야 한다(MUST).

#### Scenario: Receive remote Follow for local actor

- **WHEN** Fedify inbox listener가 verified remote `Follow` activity를 전달한다
- **THEN** 시스템은 remote actor를 `Profile`로 materialize하거나 기존 remote `Profile`을 조회한다
- **AND** `Follow.actor`는 materialized remote actor URI와 일치해야 한다
- **AND** `Follow.object`는 kosmo local actor URI로 parse되어야 하며 활성 local followee profile을 식별해야 한다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 `Follow.object`는 해당 recipient actor URI와도 일치해야 한다
- **AND** actor, object, 또는 recipient가 일치하지 않는 `Follow`는 `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하거나 갱신하지 않고 `Accept(Follow)`도 발송하지 않는다
- **AND** `Follow.object`가 활성 local followee profile을 식별하지 못하면 `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하거나 갱신하지 않고 `Accept(Follow)`도 발송하지 않는다
- **AND** remote follower와 local followee 사이에 established `ProfileFollow` 관계가 이미 있으면 시스템은 해당 관계를 idempotent하게 유지하고 `ProfileFollowRequest`를 생성하지 않는다
- **AND** existing established 관계가 있거나 local profile follow policy가 `OPEN`이면 Fedify `sendActivity`로 원본 Follow를 object로 하는 `Accept(Follow)` activity를 remote actor에게 발송한다
- **AND** established 관계가 없고 local profile follow policy가 `OPEN`이면 remote profile을 follower, local profile을 followee로 하는 established `ProfileFollow` 관계를 생성한다
- **AND** established 관계가 없고 local profile follow policy가 `APPROVAL_REQUIRED`이면 remote profile을 follower, local profile을 followee로 하는 `ProfileFollowRequest`를 생성하거나 기존 request를 유지한다
- **AND** 이번 capability는 established 관계가 없는 `APPROVAL_REQUIRED` inbound Follow에 대한 Accept 또는 Reject를 자동 발송하지 않는다
- **AND** pending remote follow request를 승인 또는 거절하고 그 결과 activity를 발송하는 UX는 후속 capability에서 다룬다

#### Scenario: Receive remote Undo Follow

- **WHEN** Fedify inbox listener가 verified remote `Undo(Follow)` activity를 전달한다
- **THEN** `Undo.object`는 Follow activity여야 한다
- **AND** `Undo.actor`는 undo 대상 Follow의 actor 및 remote follower actor URI와 일치해야 한다
- **AND** undo 대상 Follow의 object는 local followee actor URI와 일치해야 한다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 undo 대상 Follow의 object local actor URI는 recipient actor URI와 일치해야 한다
- **AND** verified same actor/object의 `Undo(Follow)`는 저장된 inbound Follow id와 다르거나 object id가 없어도 해당 follow 관계 또는 request를 취소하려는 의사로 처리한다
- **AND** 검증이 통과하면 시스템은 해당 remote follower와 local followee 사이의 established `ProfileFollow` 관계 또는 pending `ProfileFollowRequest`를 제거한다
- **AND** 시스템은 같은 remote Undo를 idempotent하게 처리한다
- **AND** actor, object, 또는 recipient가 일치하지 않는 `Undo(Follow)`는 local follow graph 또는 request를 제거하지 않는다

#### Scenario: Ignore unsupported inbox activity

- **WHEN** Fedify inbox listener가 follow graph에 필요한 ActivityPub activity가 아닌 verified activity를 전달한다
- **THEN** 시스템은 이번 capability에서 지원하지 않는 activity로 처리하지 않고 무시한다
- **AND** 시스템은 post delivery, mention, like, announce 같은 후속 activity를 처리하지 않는다
