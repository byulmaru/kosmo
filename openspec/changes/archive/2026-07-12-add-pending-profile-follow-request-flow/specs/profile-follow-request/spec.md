## ADDED Requirements

### Requirement: Pending-only Follow Request lifecycle

시스템은 local/remote Profile 사이의 승인 대기 요청을 `ProfileFollowRequest` row 존재로만 나타내야 한다(MUST).
처리 완료 상태나 처리 시각을 저장하지 않아야 한다(MUST).

#### Scenario: Create a local approval request

- **WHEN** active profile이 있는 인증자가 `APPROVAL_REQUIRED`인 다른 활성 Profile을 follow한다
- **THEN** 시스템은 follower/followee pair의 `ProfileFollowRequest`를 생성한다
- **AND** 같은 pair의 기존 request가 있으면 기존 request를 멱등하게 반환한다
- **AND** `ProfileFollow`는 생성하지 않는다
- **AND** notification lifecycle의 request-created 경계를 호출한다

#### Scenario: Create a remote approval request

- **WHEN** 검증된 remote Follow가 `APPROVAL_REQUIRED`인 local Profile을 대상으로 수신된다
- **THEN** 시스템은 같은 pending-only `ProfileFollowRequest` 저장 경계로 요청을 생성한다
- **AND** 원격 요청 처리에 필요한 Follow activity correlation은 ActivityPub Follow 경계가 소유한다
- **AND** 같은 pair와 같은 activity의 재전달은 요청을 중복 생성하지 않는다

#### Scenario: Approve a pending request

- **WHEN** request의 followee Profile이 pending request를 승인한다
- **THEN** 시스템은 request를 삭제하고 같은 pair의 `ProfileFollow`를 하나 생성한다
- **AND** 두 저장 변경은 한 transaction에서 원자적으로 적용된다
- **AND** remote follower 요청이면 commit 뒤 ActivityPub Follow 경계에 Accept delivery를 위임한다
- **AND** notification lifecycle의 request-removed 경계를 호출한다
- **AND** Accepted 상태나 처리 시각을 저장하지 않는다

#### Scenario: Reject a pending request

- **WHEN** request의 followee Profile이 pending request를 거절한다
- **THEN** 시스템은 request를 삭제한다
- **AND** `ProfileFollow`를 생성하지 않는다
- **AND** remote follower 요청이면 commit 뒤 ActivityPub Follow 경계에 Reject delivery를 위임한다
- **AND** notification lifecycle의 request-removed 경계를 호출한다
- **AND** Rejected 상태나 처리 시각을 저장하지 않는다

#### Scenario: Cancel a pending request

- **WHEN** request의 follower Profile이 pending request를 취소한다
- **THEN** 시스템은 request를 삭제한다
- **AND** `ProfileFollow`를 생성하지 않는다
- **AND** notification lifecycle의 request-removed 경계를 호출한다

### Requirement: Follow Request authorization and conflict boundaries

시스템은 request 당사자에게만 요청을 노출하고 역할에 맞는 처리만 허용해야 한다(MUST).

#### Scenario: Read participant requests

- **WHEN** active profile이 있는 인증자가 incoming 또는 outgoing request connection을 조회한다
- **THEN** incoming에는 active profile이 followee인 request만 반환한다
- **AND** outgoing에는 active profile이 follower인 request만 반환한다
- **AND** 비당사자에게는 request Node를 노출하지 않는다

#### Scenario: Prevent invalid request creation

- **WHEN** 자기 자신, 비활성 Profile, `OPEN` Profile, 차단된 pair 또는 이미 established follow인 pair에 request 생성을 시도한다
- **THEN** 시스템은 계층에 맞는 not-found, conflict 또는 permission 오류를 반환한다
- **AND** request를 생성하지 않는다

#### Scenario: Prevent processing by the wrong participant

- **WHEN** follower가 승인·거절하거나 followee가 취소하거나 비당사자가 request를 처리한다
- **THEN** 시스템은 request를 노출하지 않고 not-found로 응답한다
- **AND** request와 follow relationship을 변경하지 않는다

#### Scenario: Handle an already processed request

- **WHEN** 승인·거절·취소로 이미 삭제된 request를 다시 처리한다
- **THEN** 시스템은 request not found로 응답한다
- **AND** terminal request 기록을 복원하거나 추가하지 않는다

### Requirement: Follow Request integration ports

Follow Request lifecycle은 명시적 Notification 및 ActivityPub 경계를 호출해야 한다(MUST).
Notification 저장과 ActivityPub delivery를 직접 구현하지 않아야 한다(MUST).

#### Scenario: Delegate notification lifecycle

- **WHEN** request가 생성되거나 삭제된다
- **THEN** lifecycle service는 notification port를 호출한다
- **AND** notification row shape, 표시 상태와 delivery 정책을 Follow Request 저장 모델에 복제하지 않는다

#### Scenario: Delegate ActivityPub response delivery

- **WHEN** correlation metadata가 있는 remote request를 승인하거나 거절한다
- **THEN** lifecycle service는 기존 ActivityPub Follow response port에 request와 처리 결과를 전달한다
- **AND** HTTP signature, queue, retry 또는 activity serialization을 lifecycle service에 중복 구현하지 않는다
