## MODIFIED Requirements

### Requirement: 팔로우 요청 저장

시스템은 승인 기반 팔로우 흐름을 위해 팔로워와 팔로위 방향을 명시하는 대기 중인 프로필 간 팔로우 요청을 팔로우 관계와 별도 테이블에 저장해야 한다(MUST).

#### Scenario: 팔로우 요청 생성

- **WHEN** 한 프로필이 승인 필요한 다른 프로필에게 팔로우 요청을 보낸다
- **THEN** 시스템은 `profile_follow_request`에 `follower_profile_id`, `followee_profile_id`, 생성 시각을 저장한다
- **AND** `profile_follow_request` 행의 존재 자체가 대기 중인 요청을 의미한다
- **AND** 동일한 팔로워와 팔로위 조합의 요청은 중복될 수 없다
- **AND** 팔로워 또는 팔로위 프로필이 삭제되면 팔로우 요청도 함께 삭제된다
- **AND** pending request 생성은 저장된 followers/following count를 변경하지 않는다

#### Scenario: 팔로우 요청을 중복 생성

- **WHEN** 같은 follower/followee pair에 pending request가 이미 있고 동일한 팔로우 요청을 다시 생성한다
- **THEN** 시스템은 기존 `profile_follow_request`를 반환한다
- **AND** 새 request를 만들거나 저장 count를 변경하지 않는다

#### Scenario: 기존 팔로우 관계가 있는 요청 생성

- **WHEN** 같은 follower/followee pair에 성립된 `ProfileFollow` 관계가 이미 있고 팔로우 요청을 생성한다
- **THEN** 시스템은 기존 `ProfileFollow` 관계를 반환한다
- **AND** 같은 pair의 pending `profile_follow_request`가 남아 있으면 같은 transaction 안에서 삭제한다
- **AND** 저장 count를 중복 증가시키지 않는다

#### Scenario: 팔로우 요청 승인

- **WHEN** followee가 pending 팔로우 요청을 승인한다
- **THEN** 시스템은 `ProfileFollow` 관계를 생성하거나 이미 존재하는 관계를 반환한다
- **AND** 해당 `profile_follow_request` 행을 삭제한다
- **AND** 새 관계가 생성된 경우에만 같은 transaction에서 follower의 following count와 followee의 followers count를 1씩 증가시킨다
- **AND** 승인 상태 값이나 처리 이력을 저장하지 않는다

#### Scenario: 팔로우 요청 승인 transaction rollback

- **WHEN** 팔로우 요청 승인이 caller transaction 안에서 실행되고 caller가 transaction을 rollback한다
- **THEN** request 삭제, relation 생성과 저장 count 변경도 모두 rollback된다
- **AND** transaction 밖에서 관찰 가능한 부분 변경이 남지 않는다

#### Scenario: 팔로우 요청 동시 승인

- **WHEN** 같은 pending request를 둘 이상의 실행이 동시에 승인한다
- **THEN** 시스템은 같은 follower/followee pair에 최대 하나의 `ProfileFollow` 관계만 유지한다
- **AND** 저장 count는 관계가 실제로 생성된 한 번만 증가한다
- **AND** 완료 뒤 pending request는 남지 않는다

#### Scenario: 팔로우 요청 거절

- **WHEN** followee가 pending 팔로우 요청을 거절한다
- **THEN** 시스템은 해당 `profile_follow_request` 행을 삭제한다
- **AND** 거절 상태 값이나 처리 이력을 저장하지 않는다
- **AND** 저장 count를 변경하지 않는다

#### Scenario: 팔로우 요청 취소

- **WHEN** follower가 자신이 만든 pending 팔로우 요청을 취소한다
- **THEN** 시스템은 해당 `profile_follow_request` 행을 삭제한다
- **AND** 취소 상태 값이나 처리 이력을 저장하지 않는다
- **AND** 저장 count를 변경하지 않는다
