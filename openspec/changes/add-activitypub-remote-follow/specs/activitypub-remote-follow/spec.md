## ADDED Requirements

### Requirement: Fedify follow protocol boundary

시스템은 ActivityPub follow protocol 처리에서 Fedify가 제공하는 inbox, signature, key, send 기능을 재사용해야 한다(MUST).

#### Scenario: Use Fedify for outbound follow protocol activities

- **WHEN** 시스템이 remote actor로 Follow, Undo(Follow), Accept(Follow), 또는 Reject(Follow)를 발송한다
- **THEN** 시스템은 Fedify `sendActivity`를 사용한다
- **AND** 시스템은 HTTP signature를 직접 구현하지 않는다
- **AND** Fedify delivery queue/retry 설정과 운영 검증은 후속 capability 범위로 두고, 이번 capability에서는 queue/retry 상태를 저장하거나 직접 구현하지 않는다

#### Scenario: Use Fedify for inbound follow activities

- **WHEN** remote actor가 local actor inbox로 Follow, Undo, Accept, Reject activity를 보낸다
- **THEN** Fedify inbox listener는 verified typed activity를 kosmo follow handler에 전달한다
- **AND** 시스템은 request parsing, signature verification, remote actor key verification을 직접 구현하지 않는다

#### Scenario: Materialize unknown remote actor through lookup

- **WHEN** follow protocol handler가 remote actor URI를 참조하지만 저장된 ActivityPub remote `Profile`이 없다
- **THEN** 시스템은 actor URI만으로 `Profile`을 생성하지 않는다
- **AND** inbound `Follow`에서 `Follow.object`가 active local actor URI로 resolve되지 않거나 personal inbox recipient가 제공되었지만 같은 local actor로 resolve되지 않으면 WebFinger lookup 또는 actor materialization을 수행하지 않고 side effect 없이 무시한다
- **AND** actor URI host를 `acct:` domain으로 신뢰하지 않고, Fedify WebFinger URL-resource lookup 또는 기존 Fedify-backed materialization lookup으로 actor URI에 대응하는 `acct:{handle}@{domain}` identity와 ActivityPub self link를 실제로 검증한다
- **AND** WebFinger 결과의 `acct:` identity와 self link가 inbound activity의 remote actor URI를 검증하면 시스템은 해당 `acct:` identity를 `add-activitypub-remote-profile-federation`의 materialization 입력으로 사용한다
- **AND** materialization write 전에 해당 `acct:` domain의 기존 instance 상태가 `SUSPENDED`이면 `Profile`을 생성하거나 갱신하지 않고 `ProfileFollow` 또는 `ProfileFollowRequest`도 생성하거나 갱신하지 않는다
- **AND** materialization write 전에 해당 `acct:` domain의 기존 instance 상태가 `UNRESPONSIVE`이면 시스템은 inbound activity를 reachability signal로 보고 instance 상태를 `ACTIVE`로 갱신한 뒤 materialization과 follow 처리를 계속한다
- **AND** materialization 결과의 canonical actor URI는 inbound activity의 remote actor URI와 일치해야 한다
- **AND** WebFinger lookup이 federated handle과 actor URI를 검증하지 못하면 `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하거나 갱신하지 않는다

### Requirement: Outbound remote follow

시스템은 local profile이 remote ActivityPub profile을 follow하거나, established relation 또는 pending request를 취소할 수 있게 해야 한다(MUST).

#### Scenario: Follow active remote profile

- **WHEN** active local profile이 `followPolicy`가 `OPEN`인 활성 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 local profile을 follower, remote profile을 followee로 하는 established `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** 새 `ProfileFollow` 관계가 생성되고 remote instance 상태가 `UNRESPONSIVE`가 아닌 경우에만 Fedify `sendActivity`로 ActivityPub `Follow` activity를 발송한다
- **AND** Fedify `sendActivity`가 실패하더라도 이번 capability는 생성된 local `ProfileFollow` 관계와 저장 count를 rollback하지 않는다
- **AND** 새 `ProfileFollow` 관계가 생성되었지만 remote instance 상태가 `UNRESPONSIVE`이면 시스템은 local follow graph만 갱신하고 ActivityPub `Follow` activity를 발송하지 않는다
- **AND** `UNRESPONSIVE` 상태에서 발송이 억제된 `Follow`는 이번 capability에서 durable pending delivery로 저장하지 않으며, instance가 `ACTIVE`로 회복된 뒤의 idempotent follow retry에서도 재발송하지 않는다
- **AND** 새 logical outbound Follow activity의 id는 configured canonical origin과 생성된 `ProfileFollow.id`에서 파생한 kosmo outbound Follow URI로 고정한다
- **AND** outbound actor/object는 저장된 local follower와 remote followee actor identity에서, generation은 immutable `ProfileFollow.createdAt`에서 파생한다
- **AND** Fedify `orderingKey`는 local follower actor URI와 remote followee actor URI pair에서 안정적으로 파생하며, 같은 pair의 모든 outbound Follow와 Undo(Follow)에 재사용한다
- **AND** 기존 `ProfileFollow` 관계를 반환하는 idempotent 요청에서는 ActivityPub `Follow` activity를 다시 발송하지 않는다

#### Scenario: Request approval-required remote follow

- **WHEN** active local profile이 `followPolicy`가 `APPROVAL_REQUIRED`인 활성 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 local profile을 follower, remote profile을 followee로 하는 pending `ProfileFollowRequest`를 생성하거나 기존 request를 반환한다
- **AND** relation과 저장 count를 변경하지 않는다
- **AND** 새 request가 생성되고 remote instance가 `ACTIVE`일 때만 request id/createdAt과 저장 actor pair에서 파생한 Follow를 발송한다
- **AND** `UNRESPONSIVE`에서는 pending request만 저장하고 delivery 또는 durable retry 상태를 만들지 않는다
- **AND** duplicate 또는 concurrent 요청은 기존 request를 반환하고 Follow를 중복 발송하지 않는다
- **AND** delivery 실패는 commit된 pending request를 rollback하지 않는다

#### Scenario: Cancel approval-required remote follow

- **WHEN** local requester가 remote pending `ProfileFollowRequest`를 취소한다
- **THEN** 시스템은 조회한 exact request row를 삭제한다
- **AND** remote instance가 `ACTIVE`이면 request id/createdAt과 저장 actor pair에서 원래 Follow를 재구성해 Undo를 발송한다
- **AND** `UNRESPONSIVE` 또는 `SUSPENDED`이면 local request만 삭제하고 Undo 또는 durable retry 상태를 만들지 않는다
- **AND** duplicate 또는 concurrent cancel은 Undo를 중복 발송하지 않는다
- **AND** delivery 실패는 commit된 request 삭제를 rollback하지 않는다

#### Scenario: Remote follow accepted

- **WHEN** remote actor가 local actor가 보낸 Follow에 대한 `Accept` activity를 보낸다
- **THEN** 시스템은 pending `ProfileFollowRequest`이면 request 삭제와 established `ProfileFollow`/count 생성을 같은 transaction에서 수행하고, 이미 established이면 idempotent하게 처리한다
- **AND** `Accept.actor`는 해당 outbound Follow의 remote followee actor URI와 일치해야 한다
- **AND** `Accept.object`는 Fedify `getObject()`가 typed Follow로 제공한 경우에만 follow response로 처리하며, 그 Follow의 actor/object는 해당 outbound Follow의 local follower actor URI와 remote followee actor URI에 대응해야 한다
- **AND** embedded/typed Follow가 id를 포함하고 그 id가 kosmo outbound Follow URI이면 해당 URI는 configured canonical origin과 canonical request/relation UUID를 만족해야 한다
- **AND** embedded/typed Follow의 kosmo outbound Follow URI가 현재 row id와 다르면 local follow graph 또는 request를 갱신하지 않는다
- **AND** embedded/typed Follow의 id가 없거나 kosmo outbound Follow URI가 아니면 시스템은 actor/object 검증 결과로 해당 outbound Follow와 대응시킬 수 있다
- **AND** Fedify가 `Accept.object`를 typed Follow로 제공하지 못하면 IRI-only object를 kosmo outbound Follow URI에서 별도 복원하지 않고 local follow graph 또는 request를 갱신하지 않는다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 시스템은 해당 recipient identifier를 local actor/profile로 resolve하고, 그 canonical actor URI가 해당 outbound Follow의 local follower actor URI와 일치해야 한다
- **AND** Fedify `ctx.recipient`가 없으면 shared inbox로 간주하고 actor/object 조건으로 recipient를 검증한다
- **AND** actor, object, 또는 recipient가 일치하지 않는 `Accept`는 local follow graph 또는 request를 갱신하지 않는다
- **AND** Accept가 처리 중 확인한 exact pending request를 삭제하지 못하면 새 relation을 만들지 않는다

#### Scenario: Remote follow rejected

- **WHEN** remote actor가 local actor가 보낸 Follow에 대한 `Reject` activity를 보낸다
- **THEN** 시스템은 해당 outbound Follow가 pending request 또는 optimistic established relation으로 투영되어 있으면 조회한 exact row를 제거해야 한다
- **AND** 시스템은 거절 상태 값을 저장하지 않는다
- **AND** `Reject.actor`는 해당 outbound Follow의 remote followee actor URI와 일치해야 한다
- **AND** `Reject.object`는 Fedify `getObject()`가 typed Follow로 제공한 경우에만 follow response로 처리하며, 그 Follow의 actor/object는 해당 outbound Follow의 local follower actor URI와 remote followee actor URI에 대응해야 한다
- **AND** embedded/typed Follow가 id를 포함하고 그 id가 kosmo outbound Follow URI이면 해당 URI는 configured canonical origin과 canonical request/relation UUID를 만족해야 한다
- **AND** embedded/typed Follow의 kosmo outbound Follow URI가 현재 row id와 다르면 local follow graph 또는 request를 갱신하지 않는다
- **AND** embedded/typed Follow의 id가 없거나 kosmo outbound Follow URI가 아니면 시스템은 remote Follow id를 compatibility hint로만 취급하고 actor/object 검증 결과로 해당 outbound Follow와 대응시킬 수 있다
- **AND** Fedify가 `Reject.object`를 typed Follow로 제공하지 못하면 IRI-only object를 kosmo outbound Follow URI에서 별도 복원하지 않고 local follow graph 또는 request를 갱신하지 않는다
- **AND** `Reject.published`가 있고 그 값이 현재 outbound request/relation의 generation timestamp보다 오래되면 stale Reject로 처리하고 local follow graph 또는 request를 갱신하지 않는다
- **AND** `Reject.published`가 없으면 시스템은 수신 시각을 activity timestamp로 사용해 actor/object fallback 호환성을 유지한다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 시스템은 해당 recipient identifier를 local actor/profile로 resolve하고, 그 canonical actor URI가 해당 outbound Follow의 local follower actor URI와 일치해야 한다
- **AND** Fedify `ctx.recipient`가 없으면 shared inbox로 간주하고 actor/object 조건으로 recipient를 검증한다
- **AND** actor, object, 또는 recipient가 일치하지 않는 `Reject`는 local follow graph 또는 request를 갱신하지 않는다
- **AND** Reject가 처리 중 확인한 exact request/relation row를 삭제하지 못하면 count를 포함한 다른 상태를 변경하지 않는다

#### Scenario: Send remote Undo when unfollowing active remote profile

- **WHEN** active local profile이 `SUSPENDED` instance가 아닌 활성 ActivityPub remote profile unfollow를 요청한다
- **THEN** 시스템은 해당 `ProfileFollow` 관계를 제거한다
- **AND** remote instance 상태가 `UNRESPONSIVE`가 아니면 시스템은 Fedify `sendActivity`로 기존 Follow에 대한 `Undo` activity를 발송한다
- **AND** Fedify `sendActivity`가 실패하더라도 이번 capability는 삭제된 local `ProfileFollow` 관계와 저장 count를 rollback하지 않는다
- **AND** remote instance 상태가 `UNRESPONSIVE`이면 시스템은 ActivityPub `Undo(Follow)` activity를 발송하지 않는다
- **AND** 시스템은 현재 `ProfileFollow.id`와 저장된 local/remote actor identity에서 파생한 원본 Follow activity id, actor URI, object URI를 `Undo.object`의 대상 Follow에 사용한다
- **AND** `Undo(Follow)`를 발송할 때 시스템은 같은 local follower actor URI와 remote followee actor URI pair의 모든 Follow/Undo(Follow)에 사용하는 stable Fedify `orderingKey`를 사용한다

#### Scenario: Preserve suspended remote follow

- **WHEN** active local profile이 `SUSPENDED` instance에 속한 ActivityPub remote profile을 이미 follow 중이고 unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 해당 local `ProfileFollow` 관계와 저장 count를 보존한다
- **AND** ActivityPub `Undo(Follow)` activity를 발송하지 않는다

### Requirement: Inbound remote follow

시스템은 remote ActivityPub profile이 local profile을 follow하거나 unfollow할 수 있게 해야 한다(MUST). Remote actor가 아직 저장되어 있지 않으면 시스템은 Fedify/WebFinger lookup 기반 materialization을 먼저 수행해야 한다(MUST).

#### Scenario: Guard inbound activity from unavailable remote actor

- **WHEN** Fedify inbox listener가 verified follow protocol activity를 전달하고 remote actor가 저장된 ActivityPub remote `Profile`로 조회된다
- **THEN** 시스템은 remote actor의 instance 상태를 확인한다
- **AND** remote actor instance가 `SUSPENDED`이면 `ProfileFollow` 또는 `ProfileFollowRequest`를 생성, 갱신, 삭제하지 않고 outbound Accept 또는 Reject를 발송하지 않는다
- **AND** remote actor instance가 `UNRESPONSIVE`이면 시스템은 Fedify가 전달한 verified inbound activity 자체를 object 지원 여부와 무관한 reachability signal로 보고 instance 상태를 `ACTIVE`로 갱신한 뒤 지원되는 follow protocol 처리를 계속한다

#### Scenario: Receive remote Follow for local actor

- **WHEN** Fedify inbox listener가 verified remote `Follow` activity를 전달한다
- **THEN** 시스템은 remote actor를 `Profile`로 materialize하거나 기존 remote `Profile`을 조회한다
- **AND** `Follow.actor`는 materialized remote actor URI와 일치해야 한다
- **AND** `Follow.object`는 kosmo local actor URI로 parse되어야 하며 활성 local followee profile을 식별해야 한다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 시스템은 해당 recipient identifier를 local actor/profile로 resolve하고, 그 canonical actor URI가 `Follow.object`와 일치해야 한다
- **AND** Fedify `ctx.recipient`가 없으면 shared inbox로 간주하고 `Follow.object`로 local followee를 검증한다
- **AND** actor, object, 또는 recipient가 일치하지 않는 `Follow`는 `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하거나 갱신하지 않고 `Accept(Follow)`도 발송하지 않는다
- **AND** `Follow.object`가 활성 local followee profile을 식별하지 못하면 `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하거나 갱신하지 않고 `Accept(Follow)`도 발송하지 않는다
- **AND** remote follower와 local followee 사이에 established `ProfileFollow` 관계가 이미 있으면 시스템은 해당 관계를 idempotent하게 유지하고 `ProfileFollowRequest`를 생성하지 않는다
- **AND** remote follower와 local followee 사이에 established `ProfileFollow` 관계가 이미 있으면 같은 pair의 pending `ProfileFollowRequest`를 같은 transaction 안에서 삭제한다
- **AND** existing established 관계에 대해 같은 id의 Follow가 재전달되거나 같은 pair의 새 Follow id가 전달되어도 시스템은 별도 inbound correlation metadata를 저장하지 않고 기존 관계를 유지한다
- **AND** existing established 관계가 있거나 local profile follow policy가 `OPEN`이면 Fedify `sendActivity`로 현재 검증을 통과한 수신 Follow를 object로 하는 `Accept(Follow)` activity를 remote actor에게 발송한다
- **AND** established 관계가 없고 local profile follow policy가 `OPEN`이면 remote profile을 follower, local profile을 followee로 하는 established `ProfileFollow` 관계를 생성한다
- **AND** established 관계가 없고 local profile follow policy가 `OPEN`이면 같은 pair의 pending `ProfileFollowRequest`를 같은 transaction 안에서 삭제한다
- **AND** established 관계가 없고 local profile follow policy가 `APPROVAL_REQUIRED`이면 remote profile을 follower, local profile을 followee로 하는 `ProfileFollowRequest`를 생성하거나 기존 request를 유지한다
- **AND** `APPROVAL_REQUIRED` remote request 생성은 ActivityPub handler가 검증한 actor pair와 pending-only 저장 계약을 사용하며 inbound Follow id/actor/object를 별도 저장하지 않는다
- **AND** 기존 `ProfileFollowRequest`를 유지하는 duplicate Follow에서는 별도 inbound correlation metadata 없이 기존 request를 유지한다
- **AND** 이번 capability는 established 관계가 없는 `APPROVAL_REQUIRED` inbound Follow에 대한 Accept 또는 Reject를 자동 발송하지 않는다
- **AND** pending remote follow request의 조회·승인·거절·취소 transition과 사용자 흐름은 PROD-272의 pending-only request 계약을 따르고, 그 결과 ActivityPub delivery는 follow protocol port로 위임한다

#### Scenario: Receive remote Undo Follow

- **WHEN** Fedify inbox listener가 verified remote `Undo(Follow)` activity를 전달한다
- **THEN** `Undo.object`는 embedded Follow이거나 Fedify가 안전하게 typed Follow로 제공한 object여야 한다
- **AND** `Undo.object`가 IRI-only이면 시스템은 이번 capability에서 지원하지 않는 Undo로 처리하고 local follow graph 또는 request를 제거하지 않는다
- **AND** 저장된 `UNRESPONSIVE` actor가 보낸 verified IRI-only Undo는 network lookup이나 follow graph/request 변경 없이 instance 상태만 `ACTIVE`로 복구할 수 있다
- **AND** `Undo.actor`는 undo 대상 Follow의 actor 및 remote follower actor URI와 일치해야 한다
- **AND** undo 대상 Follow의 object는 local followee actor URI와 일치해야 한다
- **AND** undo 대상 Follow id는 remote 서버가 누락하거나 재사용할 수 있으므로 actor/object 검증을 대체하는 필수 조건으로 사용하지 않는다
- **AND** undo 대상 Follow id는 저장하거나 비교하지 않으며 id가 없거나 이전 Follow와 달라도 actor/object와 recipient가 일치하면 해당 `Undo(Follow)`는 현재 관계 또는 request를 취소하려는 의사로 처리할 수 있다
- **AND** personal inbox에서 Fedify `ctx.recipient`가 제공되면 시스템은 해당 recipient identifier를 local actor/profile로 resolve하고, 그 canonical actor URI가 undo 대상 Follow의 object local actor URI와 일치해야 한다
- **AND** Fedify `ctx.recipient`가 없으면 shared inbox로 간주하고 undo 대상 Follow object로 local followee를 검증한다
- **AND** 검증이 통과하면 시스템은 해당 remote follower와 local followee 사이의 established `ProfileFollow` 관계 또는 pending `ProfileFollowRequest`를 제거한다
- **AND** actor/object/recipient 검증이 통과한 `Undo(Follow)`는 같은 actor pair의 현재 unfollow 의사로 처리하며 activity timestamp로 순서를 추정하지 않는다
- **AND** 삭제는 처리 중 확인한 현재 row의 exact id가 일치할 때만 수행하고, established relation이 실제 삭제된 경우에만 같은 transaction에서 저장 count를 감소시킨다
- **AND** 시스템은 같은 remote Undo를 idempotent하게 처리한다
- **AND** actor, object, 또는 recipient가 일치하지 않는 `Undo(Follow)`는 local follow graph 또는 request를 제거하지 않는다

#### Scenario: Do not apply follow side effects for other inbox activities

- **WHEN** Fedify inbox listener가 follow graph에 필요한 ActivityPub activity가 아닌 verified activity를 전달한다
- **THEN** `activitypub-remote-follow` capability는 그 activity를 처리하거나 follow graph/request side effect를 만들지 않는다
- **AND** 다른 capability에 등록된 handler의 처리 여부를 금지하거나 정의하지 않는다
