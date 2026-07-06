## ADDED Requirements

### Requirement: Remote actor collection count storage

시스템은 ActivityPub remote actor materialization과 refresh 결과로 확인한 followers/following collection count를 actor metadata에 저장해야 한다(MUST).

#### Scenario: Store remote actor collection counts

- **WHEN** remote ActivityPub actor가 성공적으로 materialize되거나 refresh된다
- **THEN** 시스템은 remote followers collection count와 following collection count를 actor metadata에 저장한다
- **AND** 저장 count는 음수가 될 수 없다
- **AND** remote collection item 또는 page content는 이번 capability에서 mirror하지 않는다
- **AND** collection count를 확인할 수 없는 새 remote actor는 GraphQL non-null count 계약을 유지할 수 있도록 count를 0으로 초기화할 수 있다
- **AND** refresh에서 collection count를 확인할 수 없으면 기존 저장 count를 임의로 0으로 덮어쓰지 않는다

### Requirement: Remote follow activity correlation storage

시스템은 ActivityPub remote Follow activity를 established `ProfileFollow` 관계 또는 inbound pending `ProfileFollowRequest` 요청에 연결해 후속 Accept/Reject/Undo 처리에 필요한 correlation 정보를 저장할 수 있어야 한다(MUST).

#### Scenario: Store outbound remote Follow correlation

- **WHEN** local profile이 remote ActivityPub profile을 follow하고 outbound Follow activity를 보낸다
- **THEN** 시스템은 outbound Follow activity identity, actor URI, object URI, generation timestamp, Fedify `orderingKey`를 established `ProfileFollow`에 연결할 수 있어야 한다
- **AND** remote Accept 또는 Reject는 object로 전달되거나 참조된 Follow가 kosmo outbound Follow URI를 id로 포함하거나 참조하면 그 URI가 현재 저장된 outbound Follow identity와 일치해야 기존 follow 관계에 대응시킬 수 있어야 한다
- **AND** object로 전달되거나 참조된 Follow에 kosmo outbound Follow URI가 없으면 remote Follow id를 compatibility hint로만 취급하고 actor/object가 저장된 outbound Follow actor/object와 일치할 때 기존 follow 관계에 대응시킬 수 있어야 한다
- **AND** remote Reject의 activity timestamp가 현재 outbound Follow generation timestamp보다 오래된 것이 확인되면 actor/object가 일치해도 기존 follow 관계를 제거하지 않을 수 있어야 한다
- **AND** outbound Follow activity identity는 생성된 `ProfileFollow.id`에서 파생한 kosmo outbound Follow URI여야 한다
- **AND** outbound Follow activity identity는 follower actor URI와 followee actor URI만으로 파생하지 않고 새 logical outbound Follow activity마다 고유해야 한다
- **AND** outbound Follow activity identity는 kosmo가 발송하는 Follow/Undo transport identity로 안정적이어야 하지만, remote server가 후속 Accept/Reject object에서 이 identity를 보존한다는 것을 필수 전제로 삼지 않는다
- **AND** Fedify `orderingKey`는 follower actor URI와 followee actor URI pair에서 안정적으로 파생되어 같은 pair의 모든 outbound Follow와 Undo(Follow)에 재사용되어야 한다
- **AND** 후속 Fedify transport retry가 같은 Follow activity identity를 재사용할 수 있도록 outbound Follow activity identity를 안정적으로 저장해야 한다
- **AND** 이번 capability는 outbound `ProfileFollowRequest`를 만들지 않으며, approval-required remote follow request correlation은 후속 capability에서 다룬다
- **AND** Fedify delivery queue/retry 설정과 운영 검증은 후속 capability 범위이며, transport delivery retry와 queue 상태는 도메인 테이블에 중복 저장하지 않는다

#### Scenario: Store inbound remote Follow correlation

- **WHEN** remote ActivityPub profile이 local profile을 follow한다
- **THEN** 시스템은 local follow policy에 따라 remote follower와 local followee 사이의 established `ProfileFollow` 관계 또는 pending `ProfileFollowRequest` 요청을 저장한다
- **AND** inbound Follow activity identity, response metadata, generation timestamp는 duplicate correlation, Undo freshness guard, Accept/Reject response 구성에 사용할 수 있어야 한다
- **AND** 같은 remote follower와 local followee pair의 pending `ProfileFollowRequest`가 이미 있으면 기존 inbound Follow activity identity 또는 response metadata를 유지하고 새 duplicate Follow의 metadata로 갱신하지 않는다
- **AND** 같은 remote follower와 local followee pair의 established `ProfileFollow`가 이미 있으면 기존 inbound Follow response metadata를 유지하고 같은 id의 재전달 또는 새 Follow id를 가진 duplicate Follow의 metadata로 갱신하지 않는다
- **AND** duplicate Follow가 검증되면 first-wins response metadata를 유지하더라도 inbound Follow generation timestamp는 현재 Follow activity timestamp로 갱신할 수 있어야 한다
- **AND** duplicate inbound Follow에 대한 `Accept(Follow)` response object는 저장된 first-wins metadata가 아니라 현재 검증을 통과한 수신 Follow object를 사용할 수 있어야 한다
- **AND** inbound `Undo(Follow)`는 저장된 inbound Follow id가 다르거나 object id가 없더라도 verified same actor/object이고 activity timestamp가 현재 inbound Follow generation timestamp보다 오래되지 않았으면 해당 관계 또는 request를 취소하는 의사로 처리할 수 있어야 한다
- **AND** IRI-only `Undo.object`는 이번 capability에서 inbound Follow metadata로 역조회하지 않고 side effect 없이 무시할 수 있어야 한다
- **AND** activity-level duplicate skip은 Fedify inbox idempotency와 `ProfileFollow`/`ProfileFollowRequest` unique 제약에 맡긴다

#### Scenario: Remove rejected remote follow projection

- **WHEN** remote actor가 저장된 outbound Follow의 actor/object와 일치하는 Follow를 object로 하는 Reject를 보낸다
- **THEN** 시스템은 해당 Reject의 activity timestamp가 현재 outbound Follow generation timestamp보다 오래되지 않았으면 그 Follow에 연결된 optimistic established `ProfileFollow` projection을 제거할 수 있어야 한다
- **AND** 시스템은 거절 상태 값을 저장하지 않는다

## MODIFIED Requirements

### Requirement: 팔로우 관계 저장

시스템은 팔로워와 팔로위 방향을 명시하는 성립된 프로필 간 팔로우 관계를 저장해야 하며, local profile과 ActivityPub remote profile이 같은 관계 모델에 참여할 수 있어야 한다(MUST).

#### Scenario: 팔로우 관계 생성

- **WHEN** 한 프로필이 다른 프로필을 팔로우한다
- **THEN** 시스템은 `profile_follow`에 `follower_profile_id`, `followee_profile_id`, 생성 시각을 저장한다
- **AND** `profile_follow` 행의 존재 자체가 성립된 팔로우 관계를 의미한다
- **AND** follower 또는 followee는 local profile 또는 ActivityPub remote profile일 수 있다
- **AND** 동일한 팔로워와 팔로위 조합은 중복될 수 없다
- **AND** 팔로워 또는 팔로위 프로필이 삭제되면 팔로우 관계도 함께 삭제된다

#### Scenario: 원격 팔로우 activity correlation 추적

- **WHEN** 팔로우 관계가 ActivityPub remote profile을 포함한다
- **THEN** 시스템은 원본 Follow activity identity, actor/object URI, Fedify `orderingKey`, inbound Follow response metadata 같은 correlation metadata를 해당 `ProfileFollow` 관계 또는 inbound `ProfileFollowRequest` 요청과 연결할 수 있어야 한다
- **AND** Accept, Reject, Undo activity identity의 durable history 저장은 이번 domain table 요구사항이 아니며 Fedify idempotency 또는 후속 activity log capability의 책임이다
- **AND** transport delivery retry와 queue metadata는 Fedify가 소유하며 local-only follow 관계의 필수 값이 아니다
