## MODIFIED Requirements

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 공개 `LOCAL` profile의 정책에 따라 즉시 follow 관계를 만들거나 pending follow request를 만들 수 있어야 한다(MUST).

#### Scenario: Follow open active local profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 다른 활성 `LOCAL` profile follow를 요청한다
- **THEN** 시스템은 follow 관계를 생성한다
- **AND** mutation은 `FollowProfilePayload.result`로 생성된 `ProfileFollow`를 반환한다

#### Scenario: Follow open profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 follow 중인 활성 `LOCAL` profile follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.result`로 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다
- **AND** follower/followee 저장 count를 중복 증가시키지 않는다

#### Scenario: Request approval-required local profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `APPROVAL_REQUIRED`인 다른 활성 `LOCAL` profile follow를 요청한다
- **THEN** 시스템은 pending `ProfileFollowRequest`를 생성한다
- **AND** mutation은 `FollowProfilePayload.result`로 생성된 `ProfileFollowRequest`를 반환한다
- **AND** followers/following connection, count와 viewer follow 상태를 변경하지 않는다

#### Scenario: Request approval-required profile idempotently

- **WHEN** active profile이 있는 인증자가 같은 활성 `APPROVAL_REQUIRED` `LOCAL` profile에 이미 pending request를 보유한 상태로 follow를 다시 요청한다
- **THEN** 시스템은 `FollowProfilePayload.result`로 기존 `ProfileFollowRequest`를 반환한다
- **AND** 오류로 처리하거나 request를 중복 생성하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다
- **AND** `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하지 않는다

#### Scenario: Follow missing or unavailable profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성 프로필, 또는 `SUSPENDED` instance 소속 프로필 follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하지 않는다

#### Scenario: Reject remote profile follow before remote follow support

- **WHEN** active profile이 있는 인증자가 저장된 active remote profile follow를 요청한다
- **THEN** 시스템은 remote target follow capability가 구현되기 전까지 profile not found 오류를 반환한다
- **AND** `ProfileFollow` 관계, `ProfileFollowRequest` 요청 또는 ActivityPub activity를 생성하지 않는다

## ADDED Requirements

### Requirement: Pending follow request lifecycle

시스템은 local 또는 remote profile 사이에 이미 저장된 pending `ProfileFollowRequest`를 같은 core lifecycle로 조회·승인·거절·취소할 수 있어야 한다(MUST).

#### Scenario: Find pending request by participant pair

- **WHEN** 시스템이 follower/followee profile pair로 pending request를 조회한다
- **THEN** 동일 pair의 `ProfileFollowRequest`가 있으면 반환한다
- **AND** 없으면 없음으로 응답한다

#### Scenario: Approve incoming request

- **WHEN** active profile이 pending request의 followee이고 요청 승인을 실행한다
- **THEN** 시스템은 request를 삭제하고 성립된 `ProfileFollow`를 생성하거나 기존 관계를 반환한다
- **AND** 삭제된 request ID와 follower/followee Profile을 반환한다

#### Scenario: Reject incoming request

- **WHEN** active profile이 pending request의 followee이고 요청 거절을 실행한다. 이때 follower가 비활성이거나 remote instance가 `SUSPENDED`일 수 있다
- **THEN** 시스템은 request를 삭제한다
- **AND** 삭제된 request ID와 행동자인 non-null `followeeProfile`을 반환한다
- **AND** unavailable일 수 있는 follower Profile은 payload에 포함하지 않는다
- **AND** relation과 저장 count를 변경하지 않는다

#### Scenario: Cancel outgoing request

- **WHEN** active profile이 pending request의 follower이고 요청 취소를 실행한다. 이때 followee가 비활성이거나 remote instance가 `SUSPENDED`일 수 있다
- **THEN** 시스템은 request를 삭제한다
- **AND** 삭제된 request ID와 행동자인 non-null `followerProfile`을 반환한다
- **AND** unavailable일 수 있는 followee Profile은 payload에 포함하지 않는다
- **AND** relation과 저장 count를 변경하지 않는다

#### Scenario: Reject unauthorized request transition

- **WHEN** active profile이 request participant가 아니거나 승인·거절 주체인 followee 또는 취소 주체인 follower가 아니다
- **THEN** 시스템은 permission denied 오류를 반환한다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Reject approval with unavailable participant

- **WHEN** request participant가 비활성 상태이거나 remote participant의 instance가 `SUSPENDED`인 상태에서 승인을 실행한다
- **THEN** 시스템은 승인을 거부한다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Repeat completed request transition

- **WHEN** 이미 처리되어 존재하지 않는 request ID로 승인·거절·취소를 다시 실행한다
- **THEN** 시스템은 request not found 오류를 반환한다
- **AND** relation과 저장 count를 추가로 변경하지 않는다

### Requirement: Profile-owned follow request connections

API는 현재 active profile이 참여하는 pending follow request를 해당 `Profile`이 소유하는 incoming/outgoing connection으로 조회할 수 있게 해야 한다(MUST).

#### Scenario: Read own incoming requests

- **WHEN** active profile이 있는 인증자가 같은 active profile의 incoming follow request connection을 조회한다
- **THEN** 시스템은 해당 profile이 followee인 visible pending request를 안정적이고 결정적인 순서로 반환한다
- **AND** 각 edge의 node는 `ProfileFollowRequest`이다

#### Scenario: Read own outgoing requests

- **WHEN** active profile이 있는 인증자가 같은 active profile의 outgoing follow request connection을 조회한다
- **THEN** 시스템은 해당 profile이 follower인 visible pending request를 안정적이고 결정적인 순서로 반환한다
- **AND** 각 edge의 node는 `ProfileFollowRequest`이다

#### Scenario: Hide another profile's request connections

- **WHEN** 인증자가 현재 active profile과 다른 Profile의 incoming 또는 outgoing follow request connection을 조회한다
- **THEN** 시스템은 connection을 `null`로 반환한다
- **AND** request 존재 여부를 노출하지 않는다

#### Scenario: Keep request visible for participant cleanup

- **WHEN** 현재 active profile이 pending request의 participant이고 다른 participant가 비활성 상태이거나 remote instance가 `SUSPENDED`이다
- **THEN** 시스템은 해당 request를 현재 active profile의 incoming/outgoing connection에서 반환한다
- **AND** unavailable participant의 Profile 필드는 해당 Profile의 visibility 계약에 따라 `null`일 수 있다

#### Scenario: Paginate requests deterministically

- **WHEN** participant가 변경되지 않은 pending request connection을 opaque cursor로 페이지 이동한다
- **THEN** 시스템은 각 visible request를 결정적인 전체 순서에 따라 반환한다
- **AND** before/after 페이지 이동에서 request를 중복하거나 누락하지 않는다
