## ADDED Requirements

### Requirement: Stored profile follow counts

시스템은 local profile과 ActivityPub remote profile 모두에 대해 followers/following count를 `profile` row에 저장해야 한다(MUST).

#### Scenario: Initialize stored profile counts

- **WHEN** local profile 또는 ActivityPub remote profile이 생성된다
- **THEN** 시스템은 `profile` row에 followers count와 following count를 저장한다
- **AND** 저장 count는 음수가 될 수 없다
- **AND** 새 local profile의 followers count와 following count는 0으로 초기화한다
- **AND** 새 remote profile의 followers count와 following count는 actor materialization에서 확인한 remote followers/following collection count로 초기화한다
- **AND** remote collection count를 확인할 수 없으면 GraphQL non-null count 계약을 유지할 수 있도록 0으로 초기화할 수 있다

#### Scenario: Backfill stored profile counts

- **WHEN** followers/following 저장 count column을 기존 DB에 추가한다
- **THEN** migration은 기존 established `ProfileFollow` row를 기준으로 각 profile의 followers count와 following count를 채운다
- **AND** backfill은 기존 established relation 전체를 사용하며 profile/instance 가시성 상태를 이유로 relation을 삭제하거나 제외하지 않는다
- **AND** 이 one-time snapshot은 migration 전에 이미 비활성화된 profile 관계를 별도로 reconciliation하지 않으며 visible connection edge 수와의 상시 일치를 보장하지 않는다

#### Scenario: Update stored counts for established follow changes

- **WHEN** established `ProfileFollow` 관계가 새로 생성된다
- **THEN** 시스템은 같은 transaction에서 follower profile의 following count와 followee profile의 followers count를 1씩 증가시킨다
- **AND** follower 또는 followee가 local profile인지 ActivityPub remote profile인지는 count 갱신 조건을 바꾸지 않는다
- **AND** idempotent follow 요청처럼 기존 `ProfileFollow` 관계를 반환하는 경우에는 저장 count를 중복 증가시키지 않는다
- **AND** pending `ProfileFollowRequest` 생성 또는 삭제는 저장 count를 변경하지 않는다

#### Scenario: Update stored counts when established follow is removed

- **WHEN** established `ProfileFollow` 관계가 삭제된다
- **THEN** 시스템은 같은 transaction에서 follower profile의 following count와 followee profile의 followers count를 1씩 감소시킨다
- **AND** 저장 count는 0보다 작아질 수 없다
- **AND** follow 관계가 없어 idempotent unfollow로 처리되는 경우에는 저장 count를 변경하지 않는다
- **AND** 조건부 삭제가 expected row 불일치로 적용되지 않으면 저장 count도 변경하지 않는다

#### Scenario: Preserve stored relation and counts when a remote instance is suspended

- **WHEN** ActivityPub remote instance 상태가 `SUSPENDED`로 전환된다
- **THEN** 시스템은 해당 instance의 remote profile이 참여하는 established `ProfileFollow` row를 삭제하지 않는다
- **AND** suspension만으로 양쪽 profile의 저장 followers/following count를 변경하지 않는다
- **AND** suspension 중 GraphQL follow/unfollow action은 해당 remote profile을 NotFound로 숨긴다

#### Scenario: Refresh remote stored counts

- **WHEN** remote ActivityPub actor refresh가 followers/following collection count를 확인한다
- **THEN** 시스템은 해당 remote `Profile`의 저장 followers count와 following count를 확인한 값으로 갱신한다
- **AND** remote collection item 또는 page content는 이번 capability에서 mirror하지 않는다
- **AND** 이번 capability는 remote baseline count와 local optimistic delta를 별도 column으로 분리하지 않는다
- **AND** 저장 count는 best-effort 값이며, remote refresh와 이후 follow side effect가 마지막으로 반영한 값으로 간주한다
- **AND** remote collection count가 kosmo가 저장한 known `ProfileFollow` edge를 이미 포함하더라도 이번 capability는 해당 edge를 deduplicate하는 별도 count reconciliation model을 두지 않는다
- **AND** refresh에서 collection count를 확인할 수 없으면 기존 저장 count를 임의로 0으로 덮어쓰지 않는다

### Requirement: Remote follow activity projection

시스템은 ActivityPub remote Follow activity를 established `ProfileFollow` 관계 또는 inbound pending `ProfileFollowRequest` 요청으로 투영하고, 별도 inbound correlation 저장 없이 actor pair와 현재 저장 identity로 후속 처리를 검증할 수 있어야 한다(MUST).

#### Scenario: Derive outbound remote Follow correlation

- **WHEN** local profile이 remote ActivityPub profile을 follow하고 outbound Follow activity를 보낸다
- **THEN** 시스템은 outbound Follow activity identity를 configured canonical origin과 `ProfileFollow` 또는 `ProfileFollowRequest` id에서 파생해야 한다
- **AND** actor/object URI는 저장된 follower/followee actor identity에서, generation timestamp는 해당 row의 immutable createdAt에서 파생해야 한다
- **AND** outbound Follow activity identity는 생성된 request 또는 relation id에서 파생한 kosmo outbound Follow URI여야 한다
- **AND** outbound Follow activity identity는 follower actor URI와 followee actor URI만으로 파생하지 않고 새 logical outbound Follow activity마다 고유해야 한다
- **AND** outbound Follow activity identity는 kosmo가 발송하는 Follow/Undo transport identity로 안정적이어야 하지만, remote server가 후속 Accept/Reject object에서 이 identity를 보존한다는 것을 필수 전제로 삼지 않는다
- **AND** 후속 transport retry가 필요해도 같은 request 또는 relation row에서 같은 Follow activity identity를 다시 파생할 수 있어야 한다
- **AND** PROD-244 outbound mutation은 APPROVAL_REQUIRED remote `ProfileFollowRequest`를 만들며, inbound remote request 생성은 PROD-243이, local request 생성과 local/remote 공통 처리 lifecycle은 PROD-272가 별도 경계에서 다룬다
- **AND** delivery ordering, retry, queue와 history 같은 transport metadata는 도메인 테이블에 중복 저장하지 않는다

#### Scenario: Project inbound remote Follow without correlation storage

- **WHEN** remote ActivityPub profile이 local profile을 follow한다
- **THEN** 시스템은 local follow policy에 따라 remote follower와 local followee 사이의 established `ProfileFollow` 관계 또는 pending `ProfileFollowRequest` 요청을 저장한다
- **AND** inbound Follow activity id, actor URI와 object URI를 `ProfileFollow` 또는 `ProfileFollowRequest`에 별도 저장하지 않아야 한다
- **AND** 같은 remote follower와 local followee pair의 pending `ProfileFollowRequest`가 이미 있으면 새 duplicate Follow metadata를 저장하지 않고 기존 request를 유지한다
- **AND** 같은 remote follower와 local followee pair의 established `ProfileFollow`가 이미 있으면 같은 id의 재전달 또는 새 Follow id를 가진 duplicate Follow에서도 기존 관계를 유지한다
- **AND** duplicate inbound Follow에 대한 `Accept(Follow)` response object는 현재 검증을 통과한 수신 Follow object를 사용해야 한다
- **AND** inbound `Undo(Follow)`는 Follow id를 저장하거나 비교하지 않고 verified same actor/object이면 현재 관계 또는 request를 취소하는 의사로 처리할 수 있어야 한다
- **AND** relation/request 삭제는 처리 중 확인한 exact row가 일치할 때만 적용되고, established relation을 실제 삭제한 transaction만 저장 count를 감소시켜야 한다
- **AND** IRI-only `Undo.object`는 이번 capability에서 relation/request로 역조회하지 않고 follow graph/request side effect 없이 무시할 수 있어야 하며, 저장된 actor instance의 reachability 복구는 이 제한에 포함하지 않는다
- **AND** transport의 조기 중복 제거와 무관하게 durable relation/request side effect는 PostgreSQL unique 제약과 exact-row 조건이 source of truth여야 한다

#### Scenario: Remove rejected remote follow projection

- **WHEN** remote actor가 저장된 outbound Follow의 actor/object와 일치하는 Follow를 object로 하는 Reject를 보낸다
- **THEN** 시스템은 embedded Follow가 현재 outbound Follow generation과 일치하고 transaction에서 expected row가 여전히 현재 projection이면 pending request 또는 optimistic established relation의 exact row를 제거해야 한다
- **AND** remote `Reject.published`와 local 수신 시각은 이 판정에 사용하지 않는다
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

#### Scenario: 원격 팔로우 activity projection 추적

- **WHEN** 팔로우 관계가 ActivityPub remote profile을 포함한다
- **THEN** inbound Follow는 별도 activity identity나 actor/object metadata 없이 actor pair의 `ProfileFollow` 관계 또는 inbound `ProfileFollowRequest` 요청으로 투영해야 한다
- **AND** outbound Follow identity, actor/object URI와 generation은 established `ProfileFollow`와 저장된 actor identity에서 안정적으로 파생할 수 있어야 한다
- **AND** Accept, Reject, Undo activity identity의 durable history와 delivery ordering, retry, queue metadata는 이번 domain table 요구사항이 아니다
