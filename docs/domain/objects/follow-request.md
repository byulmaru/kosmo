# Follow Request 객체

## 정의

Follow Request는 Follower Profile이 승인제 Followee Profile에게 보낸 팔로우 요청이다. 성립된 관계는
[Follow Relationship](./follow-relationship.md)이 소유한다. Request는 방향성을 가진 Follower/Followee pair의
Pending 상태를 저장하며, 그 pair의 lifecycle orchestration은 하나의 Follow pair Workflow가 소유한다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 Followee Profile의 처리를 기다리는 Pending 요청을
뜻한다. 승인, 거절 또는 취소로 대기가 끝나면 객체를 제거한다.

## 속성

| 속성      | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건   | 조회 권한                   |
| --------- | ---------------- | ------------------------------ | --------- | ----------- | --------------------------- |
| 생성 시각 | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | 요청 당사자 | `FollowRequest.Participant` |

## 관계

| 관계             | 대상                    | 방향                      | cardinality | 존재 조건 | 조회 조건   | 조회 권한                   |
| ---------------- | ----------------------- | ------------------------- | ----------- | --------- | ----------- | --------------------------- |
| Follower Profile | [Profile](./profile.md) | Follow Request -> Profile | 1 -> 1      | 항상      | 요청 당사자 | `FollowRequest.Participant` |
| Followee Profile | [Profile](./profile.md) | Follow Request -> Profile | 1 -> 1      | 항상      | 요청 당사자 | `FollowRequest.Participant` |

같은 Follower/Followee 조합에는 Pending Follow Request가 하나만 존재한다.

## 행동

| 행동                | 행동 주체 Profile | 대상 객체      | 입력값           | 권한                                       | 조건                                                                                                                                              | 결과                                                                                                                                                                |
| ------------------- | ----------------- | -------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Follow Request 생성 | Follower Profile  | Follow Request | Followee Profile | `Account.Active`, `Profile.Member`         | 두 Profile이 다르고 Active/Normal이며 Followee의 Approval Policy가 Approval Required다. 양방향 Block, Domain Block, 기존 관계/Pending 요청이 없다 | Pending Follow Request가 생성되고 대응 Notification은 commit 뒤 비동기 projection으로 생성된다                                                                      |
| Follow Request 승인 | Followee Profile  | Follow Request | 없음             | `Account.Active`, `FollowRequest.Followee` | Follow Request가 존재하고 두 Profile이 Active/Normal이며 차단 관계와 기존 Follow Relationship이 없다                                              | Follow Request를 제거하고 새 Post 알림 Preference=false인 Follow Relationship을 원자적으로 생성하며 request Notification은 commit 뒤 비동기 projection으로 정리된다 |
| Follow Request 거절 | Followee Profile  | Follow Request | 없음             | `Account.Active`, `FollowRequest.Followee` | Follow Request가 존재한다                                                                                                                         | Follow Request를 제거하고 Notification은 commit 뒤 비동기 projection으로 정리된다                                                                                   |
| Follow Request 취소 | Follower Profile  | Follow Request | 없음             | `Account.Active`, `FollowRequest.Follower` | Follow Request가 존재한다                                                                                                                         | Follow Request를 제거하고 Notification은 commit 뒤 비동기 projection으로 정리된다                                                                                   |

승인과 거절 결과는 Follow Request 상태로 보존하지 않는다. 거절 또는 취소 뒤 다시 요청하려면 새 Follow Request를
생성하고, 이전 pair Workflow가 terminal이 된 뒤 같은 결정적 Workflow ID로 새 Run을 시작한다. 원격 요청의 승인과
거절은 같은 저장 생명주기를 적용한 뒤 ActivityPub Follow 경계에 delivery를 위임한다.

승인·거절·취소의 행동 주체가 해당 역할의 Profile이 아니면 Follow Request가 존재하지 않는 경우와 구분하지 않고
not found로 처리한다. 이 transition은 비참여자나 반대 역할의 Profile에게 Request 존재 여부를 노출하지 않는다.

Follow Request 생성은 caller 검증 뒤 `profile-follow-pair:{followerProfileId}:{followeeProfileId}` Workflow에
`FOLLOW` Update-with-Start로 admission한다. transaction Activity가 Approval Required policy와 원자적 저장을
적용하며, Update handler는 Request commit 결과를 effects보다 먼저 반환한다. Request Notification과 적용 가능한
effects는 선언된 FIFO 순서로 drain하고 retry한다. 이 Workflow는 Request가 승인·remote Accept·거절·취소될 때까지
Pending으로 유지된다.

`APPROVE`, remote `ACCEPT`, `REJECT`, `CANCEL`은 모두 같은 pair Workflow의 Update다. terminal command의 DB
commit은 즉시 결과로 반환되며, Request 정리와 Follow 생성 또는 Notification 정리 effects를 FIFO로 drain한 뒤
Workflow가 종료된다. Pending 중 Request effect가 terminal failure가 되어도 실패를 기록한 채 Pending을 유지하고,
나중의 terminal command를 계속 처리한다. terminal effects를 모두 drain한 뒤에야 Workflow 성공/실패를 확정하며,
commit된 Request/Relationship을 effect failure로 되돌리지 않는다.

Pair command에는 random `operationId`나 별도 operation receipt를 두지 않는다. 신규 Follow/Request insert는 ID를
지정하지 않고 PostgreSQL `uuidv7()` column default를 사용하며, 정상 Activity 완료 시 데이터베이스가 반환한 row ID로
결과와 create effect를 연결한다. transaction Activity가 commit된 뒤 completion 응답이 유실되면 retry는 기존 row를
중복 생성하지 않지만 이번 transition의 commit이라고 추론해 create effect를 재구성하지도 않는다. Approve/Accept
retry는 Workflow history의 exact pending Request ID가 command expected ID와 일치하고 현재 exact-pair Request가
없으며 Follow가 존재할 때 관계 상태를 `ESTABLISHED`로 수렴시키되 누락된 effects는 다시 만들지 않는다. Temporal Update ID는 RPC deduplication용이며 Follow Request의 domain identity가 아니다. 동일 pair의
실행 중 lifecycle에는 `USE_EXISTING`, terminal lifecycle 뒤 새 요청에는 `ALLOW_DUPLICATE`를 사용한다.
Initial `FOLLOW`는 실행 중인 run의 중복 admission을 합치지만, PENDING을 유지한 terminal no-op 뒤에는 participant
복구 후 같은 exact-row command를 다시 실행할 수 있도록 별도 호출이 새 transport Update ID를 사용한다.

ActivityPub inbound Follow의 actor/object/recipient 검증과 직접 Accept delivery는 Fedify handler에 남긴다. pair
Workflow effects는 ActivityPub-origin event를 다시 outbound Follow로 echo하지 않는다.

## 권한

| 권한                        | 종류      | 성립 조건                                                 |
| --------------------------- | --------- | --------------------------------------------------------- |
| `FollowRequest.Follower`    | 객체 종속 | 행동/요청 Profile이 Follow Request의 Follower Profile이다 |
| `FollowRequest.Followee`    | 객체 종속 | 행동/요청 Profile이 Follow Request의 Followee Profile이다 |
| `FollowRequest.Participant` | 객체 종속 | 요청 Profile이 Follower 또는 Followee Profile이다         |

## 조회 정책

- Follow Request는 Followers Only Post 접근 권한이나 Follow Relationship을 만들지 않는다.
- 처리 이력과 원격 delivery 상태 보존 방식은 Follow Request가 소유하지 않는다.

## 확정 용어

- 팔로우 요청: Follow Request

## 제외/보류

- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리한다.
- Profile의 application 삭제 경로는 이 객체를 직접 삭제하는 production lifecycle로 정의하지 않는다. 운영자가
  DB를 직접 삭제해 Workflow와 row가 어긋나는 경우는 알려진 운영 위험이며, 도메인 계약에 일반적인 orphan
  reconciliation을 추가하지 않는다.
