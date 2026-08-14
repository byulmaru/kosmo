## MODIFIED Requirements

### Requirement: Pending follow request lifecycle

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, PROD-770. 시스템은 local 또는 remote profile 사이에 이미 저장된 pending `ProfileFollowRequest`를 같은 core lifecycle로 조회·승인·거절·취소할 수 있어야 한다(MUST).

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

#### Scenario: Hide request existence from a nonparticipant transition

- **WHEN** current selected Profile이 request participant가 아니거나 request ID가 존재하지 않는 상태에서 승인·거절·취소를 실행한다
- **THEN** 시스템은 `NOT_FOUND` 오류를 반환한다
- **AND** request 존재 여부와 participant 구분을 노출하지 않는다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Reject a wrong-role participant transition

- **WHEN** current selected Profile이 request participant지만 승인·거절 주체인 followee 또는 취소 주체인 follower가 아니다
- **THEN** 시스템은 `PERMISSION_DENIED` 오류를 반환한다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Reject approval with unavailable participant

- **WHEN** request participant가 비활성 상태이거나 remote participant의 instance가 `SUSPENDED`인 상태에서 승인을 실행한다
- **THEN** 시스템은 승인을 거부한다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Repeat completed request transition

- **WHEN** 이미 처리되어 존재하지 않는 request ID로 승인·거절·취소를 다시 실행한다
- **THEN** 시스템은 `NOT_FOUND` 오류를 반환한다
- **AND** relation과 저장 count를 추가로 변경하지 않는다
