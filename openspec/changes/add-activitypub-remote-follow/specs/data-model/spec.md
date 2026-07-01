## ADDED Requirements

### Requirement: Remote follow activity correlation storage

시스템은 ActivityPub remote follow activity를 established `ProfileFollow` 관계 또는 pending `ProfileFollowRequest` 요청에 연결해 후속 Accept/Reject/Undo 처리에 필요한 correlation 정보를 저장할 수 있어야 한다(MUST).

#### Scenario: Store outbound remote Follow correlation

- **WHEN** local profile이 remote ActivityPub profile을 follow하고 outbound Follow activity를 보낸다
- **THEN** 시스템은 outbound Follow activity identity를 established `ProfileFollow` 또는 pending `ProfileFollowRequest`에 연결할 수 있어야 한다
- **AND** remote Accept 또는 Reject를 기존 follow 관계 또는 request에 대응시킬 수 있어야 한다
- **AND** outbound Follow activity identity는 follower actor URI와 followee actor URI만으로 파생하지 않고 발송 시도마다 고유해야 한다
- **AND** transport delivery retry와 queue 상태는 Fedify 경계에 맡기고 도메인 테이블에 중복 저장하지 않는다

#### Scenario: Store inbound remote Follow correlation

- **WHEN** remote ActivityPub profile이 local profile을 follow한다
- **THEN** 시스템은 local follow policy에 따라 remote follower와 local followee 사이의 established `ProfileFollow` 관계 또는 pending `ProfileFollowRequest` 요청을 저장한다
- **AND** inbound Follow activity identity 또는 response metadata는 domain correlation에 사용할 수 있어야 한다
- **AND** activity-level duplicate skip은 Fedify inbox idempotency와 `ProfileFollow`/`ProfileFollowRequest` unique 제약에 맡긴다

#### Scenario: Remove rejected remote follow projection

- **WHEN** remote actor가 저장된 outbound Follow에 대한 Reject를 보낸다
- **THEN** 시스템은 해당 Follow에 연결된 pending `ProfileFollowRequest` 또는 optimistic established `ProfileFollow` projection을 제거할 수 있어야 한다
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
- **THEN** 시스템은 Follow, Accept, Reject, Undo activity identity 또는 correlation metadata를 해당 `ProfileFollow` 관계 또는 `ProfileFollowRequest` 요청과 연결할 수 있어야 한다
- **AND** transport delivery retry와 queue metadata는 Fedify가 소유하며 local-only follow 관계의 필수 값이 아니다
