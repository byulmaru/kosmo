# Profile 객체

## 정의

Profile은 공개적으로 보이는 소셜 정체성이며 게시, 팔로우, 상호작용, 소셜 알림의 기본 행동 주체다.
Local Profile과 Remote Profile은 Profile Origin 상태 차원으로 구분한다.

## 상태

### Profile Lifecycle State

| 값          | 의미                           |
| ----------- | ------------------------------ |
| Active      | Profile을 사용할 수 있는 상태  |
| Deactivated | Owner가 사용을 비활성화한 상태 |
| Deleted     | 되돌릴 수 없는 terminal 상태   |

### Profile Suspension State

| 값        | 의미                                       |
| --------- | ------------------------------------------ |
| Normal    | 운영자 정지가 적용되지 않은 상태           |
| Suspended | 운영자 정지로 사용과 공개 표시가 막힌 상태 |

### Profile Origin

| 값     | 의미                                                     |
| ------ | -------------------------------------------------------- |
| Local  | 이 서버에서 생성되고 Account membership으로 운영된다     |
| Remote | 원격 Instance에서 왔으며 원격 식별자와 원본 URL을 가진다 |

### Follow Approval Policy

| 값                | 의미                                            |
| ----------------- | ----------------------------------------------- |
| Open              | 조건을 통과한 Follow Relationship을 즉시 만든다 |
| Approval Required | Follow Request 승인을 거쳐 관계를 만든다        |

## 속성

| 속성             | 타입/nullability   | 검증 정책                                                          | 존재 조건       | 조회 조건              | 조회 권한 |
| ---------------- | ------------------ | ------------------------------------------------------------------ | --------------- | ---------------------- | --------- |
| handle           | 문자열, 필수       | Local은 3-30자 영문/숫자/밑줄, Remote는 원격 원본 값을 보존한다    | 항상            | Profile 조회 정책 통과 | 없음      |
| 표시 handle      | 문자열, 필수       | 같은 Host 안에서 유일하다                                          | 항상            | Profile 조회 정책 통과 | 없음      |
| qualified handle | 문자열, 필수       | `@handle@host` 형식이며 Host는 연결된 Instance Domain에서 파생한다 | 항상            | Profile 조회 정책 통과 | 없음      |
| 표시 이름        | 문자열, 필수       | 1-40자                                                             | 항상            | Profile 조회 정책 통과 | 없음      |
| bio              | 문자열, nullable   | 500자 이하                                                         | 항상            | Profile 조회 정책 통과 | 없음      |
| Remote URL       | URL, 필수          | 원격 원본 Profile URL                                              | Origin이 Remote | Profile 조회 정책 통과 | 없음      |
| Profile Link     | URL 목록, nullable | 각 항목은 유효한 URL이다                                           | Origin이 Local  | Profile 조회 정책 통과 | 없음      |

## 관계

| 관계                | 대상                                                          | 방향                           | cardinality | 존재 조건        | 조회 조건               | 조회 권한                                 |
| ------------------- | ------------------------------------------------------------- | ------------------------------ | ----------- | ---------------- | ----------------------- | ----------------------------------------- |
| Account membership  | [Account-Profile Membership](./account-profile-membership.md) | Profile <- Membership          | 1 -> 0..N   | Origin이 Local   | Local Profile 운영 관계 | `Profile.Owner` 또는 `Membership.Account` |
| Instance            | [Instance](./instance.md)                                     | Profile -> Instance            | 1 -> 1      | 항상             | Profile 조회 정책 통과  | 없음                                      |
| avatar Media        | [Media](./media.md)                                           | Profile -> Media               | 1 -> 0..1   | 설정된 경우      | Profile 조회 정책 통과  | 없음                                      |
| header Media        | [Media](./media.md)                                           | Profile -> Media               | 1 -> 0..1   | 설정된 경우      | Profile 조회 정책 통과  | 없음                                      |
| 작성 Post           | [Post](./post.md)                                             | Profile <- Post                | 1 -> 0..N   | Post가 존재할 때 | 각 Post 조회 정책 통과  | 없음                                      |
| Follow Relationship | [Follow Relationship](./follow-relationship.md)               | Profile <- Follow Relationship | 1 -> 0..N   | 관계가 존재할 때 | 관계 당사자             | `Follow.Participant`                      |
| Follow Request      | [Follow Request](./follow-request.md)                         | Profile <- Follow Request      | 1 -> 0..N   | 요청이 존재할 때 | 요청 당사자             | `FollowRequest.Participant`               |

## 행동

| 행동                | 행동 주체      | 대상 객체 | 입력값                                                      | 권한                                 | 조건                                                                                         | 결과                                                                                                                                                                                                                       |
| ------------------- | -------------- | --------- | ----------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Profile 생성  | Account        | Profile   | handle, 선택적 표시 이름, Follow Approval Policy            | `Account.Active`                     | 같은 Local handle이 없다                                                                     | Origin=Local, Lifecycle=Active, Suspension=Normal인 Profile이 현재 Local Instance와 연결되고 Owner Membership이 생성된다. 표시 이름은 입력값이 없으면 handle이 되며 표시/qualified handle은 handle과 Instance에서 파생한다 |
| Remote Profile 등록 | 시스템         | Profile   | Instance, 원격 표현 속성, Follow Approval Policy            | `System.RemoteProfileSource`         | Instance Type이 Remote이고 새 원격 요청 허용 상태이며 입력 qualified handle의 Profile이 없다 | Origin=Remote, Lifecycle=Active, Suspension=Normal인 Profile이 입력 Instance와 연결되고 원격 표현 속성/Policy가 생성된다                                                                                                   |
| Remote Profile 갱신 | 시스템         | Profile   | 원격 표현 속성, Follow Approval Policy                      | `System.RemoteProfileSource`         | 대상 Origin이 Remote이고 Lifecycle State가 Deleted가 아니다                                  | 원격 표현 속성과 Policy가 바뀌며 Lifecycle/Suspension State는 유지된다                                                                                                                                                     |
| Profile 편집        | Account        | Profile   | 표시 이름, bio, avatar/header, 링크, Follow Approval Policy | `Account.Active`, `Profile.Owner`    | Origin이 Local이고 Lifecycle State가 Deleted가 아니며 Suspension State가 Normal이다          | Profile 표현 속성, Policy, 선택된 Media 관계가 바뀐다                                                                                                                                                                      |
| Profile 비활성화    | Account        | Profile   | 없음                                                        | `Account.Active`, `Profile.Owner`    | Origin이 Local이고 Lifecycle State가 Active이며 Suspension State가 Normal이다                | Lifecycle State가 Deactivated가 된다                                                                                                                                                                                       |
| Profile 재활성화    | Account        | Profile   | 없음                                                        | `Account.Active`, `Profile.Owner`    | Origin이 Local이고 Lifecycle State가 Deactivated이며 Suspension State가 Normal이다           | Lifecycle State가 Active가 된다                                                                                                                                                                                            |
| Profile 삭제        | Account        | Profile   | 없음                                                        | `Account.Active`, `Profile.Owner`    | Origin이 Local이고 Lifecycle State가 Deactivated이며 Suspension State가 Normal이다           | Lifecycle State가 Deleted가 된다                                                                                                                                                                                           |
| Profile 정지        | 운영자 Account | Profile   | 사유                                                        | `Account.Active`, `Account.Operator` | Lifecycle State가 Deleted가 아니고 Suspension State가 Normal이다                             | Suspension State가 Suspended가 되고 Lifecycle State는 유지된다                                                                                                                                                             |
| Profile 정지 해제   | 운영자 Account | Profile   | 사유                                                        | `Account.Active`, `Account.Operator` | Suspension State가 Suspended다                                                               | Suspension State가 Normal이 되고 Lifecycle State는 유지된다                                                                                                                                                                |

Profile Origin은 연결된 Instance Type과 같아야 한다. Follow Approval Policy 변경은 이미 존재하는 Pending Follow
Request의 상태나 존재를 바꾸지 않는다.

## 권한

| 권한                         | 종류      | 성립 조건                                                       |
| ---------------------------- | --------- | --------------------------------------------------------------- |
| `Profile.Member`             | 객체 종속 | Account가 Local Profile의 Owner 또는 Member Membership을 가진다 |
| `Profile.Owner`              | 객체 종속 | Account가 Local Profile의 Owner Membership을 가진다             |
| `System.RemoteProfileSource` | 독립      | 시스템이 Remote Profile 원본 정보를 반영하는 주체다             |

## 조회 정책

- 공개 Profile 정보는 Lifecycle State가 Active이고 Suspension State가 Normal일 때 조회할 수 있다.
- Local Profile의 Owner와 운영자 Account는 운영에 필요한 비공개 상태를 조회할 수 있다.
- Remote Profile은 Instance의 Safety State가 Domain Block이 아니어야 한다.
- viewer Profile의 Profile Domain Block 대상 Instance에 속한 Remote Profile은 viewer에게 없는 것처럼 취급한다.
- 공개 검색 후보는 위 조회 조건을 통과해야 하며 Domain Limit Instance의 Remote Profile은 제외한다.
- Remote Profile lookup은 Instance의 Safety State가 Domain Block이 아니고 Reachability State가
  Reachable이며 Service State가 Active일 때만 새 원격 요청을 보낼 수 있다.

## 확정 용어

- 프로필: Profile
- 로컬 프로필: Local Profile
- 원격 프로필: Remote Profile
- Profile Lifecycle State: Profile Lifecycle State
- Profile Suspension State: Profile Suspension State
- 표시 handle: Display Handle
- qualified handle: Qualified Handle
- 원격 원본 URL: Remote URL
- 팔로우 승인 정책: Follow Approval Policy

## 제외/보류

- 팔로워/팔로잉 목록 공개 범위의 구체 값은 확정 전이므로 canonical 속성에서 제외한다.
- 다른 Profile의 Media를 avatar/header로 재사용할 수 있는지는 후속 결정 대상으로 둔다.
- active Profile 선택은 Profile 객체를 바꾸지 않는 세션 동작이므로 도메인 행동에서 제외한다.
- Profile tag, theme, 계정 이동, 서버 이전은 현재 범위에서 제외한다.
