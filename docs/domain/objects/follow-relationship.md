# Follow Relationship 객체

## 정의

Follow Relationship은 Profile 간 성립된 follower/followee 방향 관계다. 승인 대기는
[Follow Request](./follow-request.md)가 소유하고, 승인·거절 처리 결과는 Follow Request에 보존하지 않는다. Follow
생성과 승인 대기의 orchestration은 방향성을 가진 Follower/Followee pair Workflow가 소유한다.

## 상태

이 객체는 별도 상태 차원을 가지지 않는다. 객체의 존재가 성립된 팔로우 관계를 뜻한다.

## 속성

| 속성                           | 타입/nullability | 검증 정책                      | 존재 조건 | 조회 조건            | 조회 권한            |
| ------------------------------ | ---------------- | ------------------------------ | --------- | -------------------- | -------------------- |
| 생성 시각                      | 시각, 필수       | 생성 결과로 기록하며 변경 불가 | 항상      | 관계 당사자          | `Follow.Participant` |
| 관계별 새 Post 알림 Preference | boolean, 필수    | 생성 시 기본값은 false다       | 항상      | follower의 개인 설정 | `Follow.Follower`    |

## 관계

| 관계             | 대상                    | 방향                           | cardinality | 존재 조건 | 조회 조건   | 조회 권한            |
| ---------------- | ----------------------- | ------------------------------ | ----------- | --------- | ----------- | -------------------- |
| Follower Profile | [Profile](./profile.md) | Follow Relationship -> Profile | 1 -> 1      | 항상      | 관계 당사자 | `Follow.Participant` |
| Followee Profile | [Profile](./profile.md) | Follow Relationship -> Profile | 1 -> 1      | 항상      | 관계 당사자 | `Follow.Participant` |

같은 follower/followee 조합에는 Follow Relationship이 하나만 존재한다.

## 행동

| 행동                         | 행동 주체 Profile | 대상 객체           | 입력값           | 권한                                | 조건                                                                                                                                      | 결과                                                                                                                                                                                         |
| ---------------------------- | ----------------- | ------------------- | ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Follow Relationship 생성     | Follower Profile  | Follow Relationship | Followee Profile | `Account.Active`, `Profile.Member`  | 두 Profile이 다르고 Active/Normal이며 Followee의 Approval Policy가 Open이다. 양방향 Profile Block, Profile Domain Block, 기존 관계가 없다 | 새 Post 알림 Preference=false인 Follow Relationship이 생성된다. 같은 조합의 Pending Follow Request가 있으면 제거되고, 대응 Notification 생성·정리는 commit 뒤 비동기 projection으로 수렴한다 |
| Unfollow                     | Follower Profile  | Follow Relationship | 없음             | `Account.Active`, `Follow.Follower` | 관계가 존재한다                                                                                                                           | Follow Relationship이 제거되고 이 관계를 원인으로 가진 Notification은 commit 뒤 비동기 projection으로 정리된다                                                                               |
| 새 Post 알림 Preference 변경 | Follower Profile  | Follow Relationship | boolean          | `Account.Active`, `Follow.Follower` | 관계가 존재한다                                                                                                                           | Preference가 바뀐다                                                                                                                                                                          |

Approval Policy가 Approval Required인 Followee에는 Follow Relationship을 직접 생성하지 않고 Follow Request를 생성한다.
Approval Policy 변경만으로 기존 Pending Follow Request를 승인하거나 제거하지 않는다.

Follow 생성은 caller 검증 뒤 `profile-follow-pair:{followerProfileId}:{followeeProfileId}` Workflow에 `FOLLOW`
Update-with-Start된다. transaction Activity가 Open policy면 Follow Relationship을 commit하고, Update handler가
commit 결과를 즉시 반환한 뒤 Notification과 적용 가능한 ActivityPub effects를 FIFO로 drain하고 Workflow를 종료한다.
Approval Required면 Request를 commit하고 동일 Workflow가 Pending으로 남는다. `APPROVE` 또는 remote `ACCEPT`가
Request를 제거하고 Follow Relationship을 원자적으로 생성하면 commit 결과를 먼저 반환하고 queued effects를 drain한
뒤 Workflow가 종료된다.

Follow pair Workflow는 한 번에 하나의 lifecycle command만 처리하며 in-flight guard와 DB uniqueness/exact-row
조건을 함께 사용한다. Pending 중 Request effect의 terminal failure는 Workflow state에 기록하지만 Pending 대기를
끝내지 않는다. `APPROVE`, `ACCEPT`, `REJECT`, `CANCEL`의 terminal command가 commit된 뒤에는 queued effects를
선언된 FIFO 순서로 drain하고, drain 뒤 terminal failure를 반영해 Workflow 성공/실패를 확정한다. effect failure는
이미 commit된 Follow Relationship을 rollback하지 않는다.

거절·취소 뒤 새 Follow를 시도하면 이전 pair Workflow가 terminal이 된 뒤 같은 결정적 Workflow ID로 새 Run을 시작하며
`ALLOW_DUPLICATE` reuse policy를 사용한다. 실행 중인 lifecycle에는 `USE_EXISTING`을 사용한다. Pair command에는
random `operationId`나 operation receipt를 두지 않는다. 생성할 Follow/Request의 candidate domain row ID를
transaction 전에 Workflow history에 배정하고 exact ID로 저장하며, Activity retry는 mutation 전 pair snapshot,
candidate/expected row와 Workflow snapshot으로 결과를 재구성한다. Unfollow는 이 Workflow가 다음 command를 기다리지 않고 별도 짧은 Workflow에서
처리한다.

ActivityPub inbound Follow의 actor/object/recipient 검증과 직접 Accept delivery는 Fedify handler가 계속 소유한다.
Follow effects는 ActivityPub-origin event를 outbound Follow로 echo하지 않는다.

## 권한

| 권한                 | 종류      | 성립 조건                                                      |
| -------------------- | --------- | -------------------------------------------------------------- |
| `Follow.Follower`    | 객체 종속 | 행동/요청 Profile이 Follow Relationship의 Follower Profile이다 |
| `Follow.Followee`    | 객체 종속 | 행동/요청 Profile이 Follow Relationship의 Followee Profile이다 |
| `Follow.Participant` | 객체 종속 | 요청 Profile이 Follower 또는 Followee Profile이다              |

## 조회 정책

- Follower/Followee 목록은 Active/Normal Profile 사이의 현재 Follow Relationship을 기준으로 한다.
- Profile에 저장된 Follower/Followee 수는 best-effort projection이며, visible 목록의 정확한 edge
  수를 보장하는 membership source of truth가 아니다.
- Profile 비활성화 전이는 관계를 보존하면서 남은 Active 상대 Profile의 저장 count를 조정한다.
- Profile Block과 Domain Block은 Follow Relationship보다 우선한다.
- Follow Relationship은 Follower와 Followee Profile 사이의 현재 established 관계다. inbound Followers Only
  수신 relevance는 이 관계와 함께 Follower가 Active local Profile·Active local Instance에 연결되어 있는지
  확인한다. 조회 access는 기존 established 관계와 Profile/Instance eligibility 정책을 사용하며, pending·rejected·removed
  Follow Request 또는 unfollow 뒤에는 현재 관계가 없다.
- 팔로워/팔로잉 목록 공개 정책의 구체 값이 확정되기 전에는 관계 당사자 외 공개 범위를 확장하지 않는다.

## 확정 용어

- 팔로우: Follow
- 팔로워: Follower
- 팔로잉 대상: Followee
- 관계별 설정: Relationship Preference

## 제외/보류

- 팔로우 가져오기/내보내기, 계정 이동, 서버 이전, 백업은 현재 범위에서 제외한다.
- List, 추천 팔로우, Followed Hashtag, 가까운 친구 또는 서클은 현재 범위에서 제외한다.
- 원격 follow delivery 실패, 재시도, 동기화 상태는 구현/연합 스펙으로 분리한다.
