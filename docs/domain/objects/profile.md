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
| 팔로워 수        | 0 이상 정수, 필수  | 저장된 best-effort Follow Relationship 수다                        | 항상            | Profile 조회 정책 통과 | 없음      |
| 팔로잉 수        | 0 이상 정수, 필수  | 저장된 best-effort Follow Relationship 수다                        | 항상            | Profile 조회 정책 통과 | 없음      |
| Remote URL       | URL, 필수          | 원격 원본 Profile URL                                              | Origin이 Remote | Profile 조회 정책 통과 | 없음      |
| Profile Link     | URL 목록, nullable | 각 항목은 유효한 URL이다                                           | Origin이 Local  | Profile 조회 정책 통과 | 없음      |

## 관계

| 관계                | 대상                                                          | 방향                           | cardinality | 존재 조건        | 조회 조건              | 조회 권한                                 |
| ------------------- | ------------------------------------------------------------- | ------------------------------ | ----------- | ---------------- | ---------------------- | ----------------------------------------- |
| Account membership  | [Account-Profile Membership](./account-profile-membership.md) | Profile <- Membership          | 1 -> 0..N   | 관계가 존재할 때 | Membership 당사자 관계 | `Profile.Owner` 또는 `Membership.Account` |
| Instance            | [Instance](./instance.md)                                     | Profile -> Instance            | 1 -> 1      | 항상             | Profile 조회 정책 통과 | 없음                                      |
| avatar Media        | [Media](./media.md)                                           | Profile -> Media               | 1 -> 0..1   | 설정된 경우      | Profile 조회 정책 통과 | 없음                                      |
| header Media        | [Media](./media.md)                                           | Profile -> Media               | 1 -> 0..1   | 설정된 경우      | Profile 조회 정책 통과 | 없음                                      |
| Profile Tag         | [Hashtag](./hashtag.md)                                       | Profile -> Hashtag             | 1 -> 0..N   | 설정된 경우      | Profile 조회 정책 통과 | 없음                                      |
| 작성 Post           | [Post](./post.md)                                             | Profile <- Post                | 1 -> 0..N   | Post가 존재할 때 | 각 Post 조회 정책 통과 | 없음                                      |
| Follow Relationship | [Follow Relationship](./follow-relationship.md)               | Profile <- Follow Relationship | 1 -> 0..N   | 관계가 존재할 때 | 관계 당사자            | `Follow.Participant`                      |
| Follow Request      | [Follow Request](./follow-request.md)                         | Profile <- Follow Request      | 1 -> 0..N   | 요청이 존재할 때 | 요청 당사자            | `FollowRequest.Participant`               |

## 행동

| 행동                | 행동 주체      | 대상 객체           | 입력값                                                                        | 권한                                 | 조건                                                                                         | 결과                                                                                                                                                                                                                       |
| ------------------- | -------------- | ------------------- | ----------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Profile 생성  | Account        | Profile             | handle, 선택적 표시 이름, Follow Approval Policy                              | `Account.Active`                     | 같은 Local handle이 없다                                                                     | Origin=Local, Lifecycle=Active, Suspension=Normal인 Profile이 현재 Local Instance와 연결되고 Owner Membership이 생성된다. 표시 이름은 입력값이 없으면 handle이 되며 표시/qualified handle은 handle과 Instance에서 파생한다 |
| Remote Profile 등록 | 시스템         | Profile             | Instance, 원격 표현 속성, Follow Approval Policy                              | `System.RemoteProfileSource`         | Instance Type이 Remote이고 새 원격 요청 허용 상태이며 입력 qualified handle의 Profile이 없다 | Origin=Remote, Lifecycle=Active, Suspension=Normal인 Profile이 입력 Instance와 연결되고 원격 표현 속성/Policy가 생성된다                                                                                                   |
| Remote Profile 갱신 | 시스템         | Profile             | 원격 표현 속성, Follow Approval Policy                                        | `System.RemoteProfileSource`         | 대상 Origin이 Remote이고 Lifecycle State가 Deleted가 아니다                                  | 원격 표현 속성과 Policy가 바뀌며 Lifecycle/Suspension State는 유지된다                                                                                                                                                     |
| Profile 편집        | Account        | 현재 선택된 Profile | 표시 이름, bio, avatar/header, 링크, Follow Approval Policy, Profile Tag 목록 | `Account.Active`, `Profile.Owner`    | Origin이 Local이고 Lifecycle State가 Active이며 Suspension State가 Normal이다                | Profile 표현 속성, Policy, 선택된 Media 관계와 Profile Tag 목록이 원자적으로 바뀐다                                                                                                                                        |
| Profile 비활성화    | Account        | Profile             | 없음                                                                          | `Account.Active`, `Profile.Owner`    | Origin이 Local이고 Lifecycle State가 Active이며 Suspension State가 Normal이다                | Lifecycle State가 Deactivated가 된다                                                                                                                                                                                       |
| Profile 재활성화    | Account        | Profile             | 없음                                                                          | `Account.Active`, `Profile.Owner`    | Origin이 Local이고 Lifecycle State가 Deactivated이며 Suspension State가 Normal이다           | Lifecycle State가 Active가 된다                                                                                                                                                                                            |
| Profile 삭제        | Account        | Profile             | 없음                                                                          | `Account.Active`, `Profile.Owner`    | Origin이 Local이고 Lifecycle State가 Deactivated이며 Suspension State가 Normal이다           | Lifecycle State가 Deleted가 된다                                                                                                                                                                                           |
| Profile 정지        | 운영자 Account | Profile             | 사유                                                                          | `Account.Active`, `Account.Operator` | Lifecycle State가 Deleted가 아니고 Suspension State가 Normal이다                             | Suspension State가 Suspended가 되고 Lifecycle State는 유지된다                                                                                                                                                             |
| Profile 정지 해제   | 운영자 Account | Profile             | 사유                                                                          | `Account.Active`, `Account.Operator` | Suspension State가 Suspended다                                                               | Suspension State가 Normal이 되고 Lifecycle State는 유지된다                                                                                                                                                                |

Profile Origin은 연결된 Instance Type과 같아야 한다. Follow Approval Policy 변경은 이미 존재하는 Pending Follow
Request의 상태나 존재를 바꾸지 않는다.

Profile Tag는 Profile이 [Hashtag](./hashtag.md)를 참조하는 구조화 관계다. bio에서 파생하지 않으며 관계는
순서를 가지지 않는다. 제품상 Profile Tag 개수 상한은 두지 않는다. Profile 편집 입력은 각 이름을
[Hashtag](./hashtag.md)의 canonical Hashtag identity로 먼저 해석·생성한 뒤, 동일 Hashtag identity를 둘 이상
참조하는 목록은 거부한다. Profile 비활성화와 정지는 관계를 보존하지만 공개 조회에서는 Profile과 함께 숨긴다.
Lifecycle State가 Deleted로 전이됐다는 이유만으로 Profile Tag 관계를 제거하지 않는다. 관계 cleanup이 필요하다면
삭제 상태 전이와 분리된 canonical 보존·파기 정책에서 대상과 시점을 결정한다. 다른 Post 또는 Profile이 참조하는
Hashtag에는 영향을 주지 않는다.

## 권한

| 권한                         | 종류      | 성립 조건                                                 |
| ---------------------------- | --------- | --------------------------------------------------------- |
| `Profile.Member`             | 객체 종속 | Account가 Profile의 Owner 또는 Member Membership을 가진다 |
| `Profile.Owner`              | 객체 종속 | Account가 Local Profile의 Owner Membership을 가진다       |
| `System.RemoteProfileSource` | 독립      | 시스템이 Remote Profile 원본 정보를 반영하는 주체다       |

## 조회 정책

- 공개 Profile 정보는 Lifecycle State가 Active이고 Suspension State가 Normal일 때 조회할 수 있다.
- Local Profile의 Owner와 운영자 Account는 운영에 필요한 비공개 상태를 조회할 수 있다.
- Remote Profile은 Instance의 Safety State가 Domain Block이 아니어야 한다.
- viewer Profile의 Profile Domain Block 대상 Instance에 속한 Remote Profile은 viewer에게 없는 것처럼 취급한다.
- 공개 검색 후보는 위 조회 조건을 통과해야 하며 Domain Limit Instance의 Remote Profile은 제외한다.
- Profile Tag는 해당 Profile이 위 공개 조회 조건을 통과할 때만 공개하며 독립적인 공개 범위를 가지지 않는다.
- Hashtag 관련 Profile 목록 탐색은 [ADR 0021](../decisions/0021-hashtag-related-profile-navigation.md)에 따라
  공개 조회 가능한 Active·Normal Local Profile 중 TagChip이 전달한 Hashtag identity 정확 일치만 후보로 사용한다.

위 Domain Limit 및 viewer Profile Domain Block 규칙은 공개 Profile 조회·검색의 최종 canonical moderation
정책이다. 다만 해당 정책을 exact/partial Profile lookup에 함께 적용할 저장 모델과 공통 predicate가 아직 없는
현재 단계에서는 [ADR 0017](../decisions/0017-profile-search-staged-visibility.md)의 제한된 staged exception을
적용할 수 있다. 현재 저장된 Profile의 exact `profileByHandle`과 partial `searchProfiles`는 같은 visibility를
사용해 configured local Instance의 `Active` Profile과, 입력 domain의 ActivityPub Instance에 저장된 `Active`
Remote Profile(단, `InstanceState.SUSPENDED` Instance 제외)만 반환한다. 이 예외는 최종 moderation 정책이
Domain Limit/Profile Domain Block을 허용하거나 생략하도록 바꾸지 않으며, 공통 predicate가 준비되면 exact와
partial lookup을 함께 전환해야 한다.

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
- 팔로워 수: Followers Count
- 팔로잉 수: Following Count
- 프로필 태그: Profile Tag

## 제외/보류

- 팔로워/팔로잉 membership 목록 공개 범위의 구체 값은 확정 전이다.
- 다른 Profile의 Media를 avatar/header로 재사용할 수 있는지는 후속 결정 대상으로 둔다.
- active Profile 선택은 Profile 객체를 바꾸지 않는 세션 동작이므로 도메인 행동에서 제외한다.
- theme, 계정 이동, 서버 이전은 현재 범위에서 제외한다.
- Remote Profile의 Profile Tag 수집·표시와 ActivityPub 표현은 현재 범위에서 제외한다.
