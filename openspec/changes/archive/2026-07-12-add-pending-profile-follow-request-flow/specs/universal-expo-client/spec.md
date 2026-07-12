## MODIFIED Requirements

### Requirement: Relay GraphQL environment

유니버설 클라이언트는 shared Relay environment를 사용해야 한다(MUST).
generated artifacts로 GraphQL 데이터를 선언적으로 읽고 갱신해야 한다(MUST).

#### Scenario: Normalize follow request mutation responses

- **WHEN** follow, approve, reject 또는 cancel request mutation이 영향받은 Node ID와 viewer 상태를 반환한다
- **THEN** Relay store는 같은 Profile과 Follow Request를 구독하는 화면에 응답을 반영한다
- **AND** 정규화 가능한 변경 때문에 전체 application store를 수동 재조회하지 않는다

## ADDED Requirements

### Requirement: Follow action states

유니버설 FollowButton은 established follow와 pending follow request를 구분해야 한다(MUST).
동일한 동작을 web/native에서 제공해야 한다(MUST).

#### Scenario: Create an approval request

- **WHEN** viewer가 `APPROVAL_REQUIRED` Profile의 팔로우 버튼을 누른다
- **THEN** client는 `followProfile` mutation을 실행한다
- **AND** 응답의 pending request를 반영해 버튼을 `요청됨` 상태로 표시한다

#### Scenario: Cancel an outgoing request

- **WHEN** viewer가 `요청됨` 상태의 버튼을 누른다
- **THEN** client는 request cancel mutation을 실행한다
- **AND** 성공하면 버튼을 다시 `팔로우` 상태로 표시한다

#### Scenario: Preserve established follow behavior

- **WHEN** viewer가 established follow 상태의 버튼을 누른다
- **THEN** client는 기존 unfollow mutation을 실행한다
- **AND** pending request가 established follow로 오인되지 않는다

#### Scenario: Process incoming requests

- **WHEN** viewer가 알림 화면에서 incoming follow request를 확인한다
- **THEN** client는 follower identity와 승인·거절 action을 표시한다
- **AND** 승인 또는 거절 성공 시 처리된 request를 incoming connection에서 제거한다
- **AND** 실패하면 request를 유지하고 오류를 표시한다
