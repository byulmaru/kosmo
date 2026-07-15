## ADDED Requirements

### Requirement: ProfileFollowRequest Relay Node contract

API는 pending follow request를 participant에게만 노출되는 Relay Node로 제공해야 한다(MUST).

#### Scenario: Read request Node as participant

- **WHEN** 현재 active profile이 follower 또는 followee인 인증자가 `ProfileFollowRequest` global ID를 조회한다
- **THEN** 시스템은 해당 pending `ProfileFollowRequest` Node를 반환한다
- **AND** Node의 follower와 followee 필드는 각 Profile이 viewer에게 노출 가능한 경우 반환한다

#### Scenario: Hide request Node from non-participant

- **WHEN** 현재 active profile이 request participant가 아닌 인증자 또는 active profile이 없는 viewer가 request global ID를 조회한다
- **THEN** 시스템은 Node를 `null`로 반환한다
- **AND** request 존재 여부를 오류나 다른 필드로 노출하지 않는다

#### Scenario: Read request Node for cleanup with unavailable participant

- **WHEN** 현재 active profile이 request participant이고 다른 participant가 비활성 상태이거나 remote instance가 `SUSPENDED`인 request global ID를 조회한다
- **THEN** 시스템은 해당 pending `ProfileFollowRequest` Node를 반환한다
- **AND** unavailable participant의 Profile 필드는 해당 Profile의 visibility 계약에 따라 `null`일 수 있다

### Requirement: Follow profile success union contract

API는 follow 요청 성공 결과가 성립된 관계인지 pending 요청인지 GraphQL union으로 구분해야 한다(MUST).

#### Scenario: Return established follow result

- **WHEN** `followProfile`이 새 관계를 생성하거나 기존 관계를 반환한다
- **THEN** `FollowProfilePayload.result`는 `ProfileFollowResult` union의 `ProfileFollow` concrete type이다
- **AND** payload는 cache 갱신에 필요한 follower와 followee Profile을 포함한다

#### Scenario: Return pending request result

- **WHEN** `followProfile`이 새 pending request를 생성하거나 기존 request를 반환한다
- **THEN** `FollowProfilePayload.result`는 `ProfileFollowResult` union의 `ProfileFollowRequest` concrete type이다
- **AND** payload는 cache 갱신에 필요한 follower와 followee Profile을 포함한다

### Requirement: Follow request transition payload contract

API는 request 승인·거절·취소 결과가 Relay cache에서 삭제된 request를 제거하고, 승인으로 변경된 관계와 Profile을 갱신할 수 있는 payload를 반환해야 한다(MUST).

#### Scenario: Return approval payload

- **WHEN** follow request 승인이 성공한다
- **THEN** payload는 생성되거나 기존에 있던 `ProfileFollow`를 반환한다
- **AND** 삭제된 `ProfileFollowRequest` global ID를 반환한다
- **AND** follower와 followee Profile을 반환한다

#### Scenario: Return rejection payload

- **WHEN** follow request 거절이 성공한다
- **THEN** payload는 삭제된 `ProfileFollowRequest` global ID를 반환한다
- **AND** 행동자인 non-null `followeeProfile`을 반환한다
- **AND** unavailable일 수 있는 follower Profile은 payload에 포함하지 않는다
- **AND** 삭제된 `ProfileFollowRequest` Node 자체를 반환하지 않는다

#### Scenario: Return cancellation payload

- **WHEN** follow request 취소가 성공한다
- **THEN** payload는 삭제된 `ProfileFollowRequest` global ID를 반환한다
- **AND** 행동자인 non-null `followerProfile`을 반환한다
- **AND** unavailable일 수 있는 followee Profile은 payload에 포함하지 않는다
- **AND** 삭제된 `ProfileFollowRequest` Node 자체를 반환하지 않는다

#### Scenario: Identify the actor connection edge to remove

- **WHEN** follow request 거절 또는 취소가 성공한다
- **THEN** payload의 actor Profile은 갱신할 incoming 또는 outgoing request connection의 소유자를 식별한다
- **AND** payload의 삭제된 `ProfileFollowRequest` global ID는 해당 connection edge를 제거할 수 있게 한다
