# Profile 객체

## 정의

Profile은 공개적으로 보이는 소셜 정체성이며 게시, 팔로우, 상호작용, 소셜 알림의 기본 행동 주체다.
Local Profile과 Remote Profile은 Profile Origin 상태 차원으로 구분한다.

## 상태

### Profile State

| 값       | 의미                              |
| -------- | --------------------------------- |
| 활성     | Profile을 사용할 수 있는 상태     |
| 비활성화 | Profile 사용이 비활성화된 상태    |
| 정지     | Profile 사용과 표시가 정지된 상태 |
| 삭제됨   | terminal 상태                     |

### Profile Origin

| 값             | 의미                                                         |
| -------------- | ------------------------------------------------------------ |
| Local Profile  | 이 서버에서 생성되고 Account membership으로 운영된다         |
| Remote Profile | 원격 서버에서 온 Profile이며 원격 식별자와 원본 URL을 가진다 |

## 속성

| 속성                  | 타입/nullability             | 검증 정책                                   | 상태별 존재 조건 | 조회 권한         |
| --------------------- | ---------------------------- | ------------------------------------------- | ---------------- | ----------------- |
| handle                | 문자열, 필수                 | 로컬 handle은 3-30자, 영문/숫자/밑줄만 허용 | 모든 상태        | `Profile.Visible` |
| 표시 handle           | 문자열, 필수                 | 같은 Host 안에서 중복될 수 없다             | 모든 상태        | `Profile.Visible` |
| qualified handle      | 문자열, 필수                 | `@handle@host` 형식                         | 원격 식별 시     | `Profile.Visible` |
| 표시 이름             | 문자열, 필수                 | 1-40자                                      | 모든 상태        | `Profile.Visible` |
| bio                   | 문자열, nullable             | 500자 이하                                  | 모든 상태        | `Profile.Visible` |
| Profile State         | Profile State, 필수          | 위 상태 값만 허용                           | 모든 상태        | `Profile.Visible` |
| Profile Origin        | Profile Origin, 필수         | Local Profile 또는 Remote Profile           | 모든 상태        | `Profile.Visible` |
| 팔로우 승인 정책      | Follow Approval Policy, 필수 | 자유 또는 승인제                            | 모든 상태        | `Profile.Visible` |
| 팔로워 목록 공개 범위 | 정책 값, 필수                | 미정                                        | 모든 상태        | `Profile.Visible` |
| 팔로잉 목록 공개 범위 | 정책 값, 필수                | 미정                                        | 모든 상태        | `Profile.Visible` |
| Remote URL            | URL, nullable                | 원격 Profile 식별에 사용                    | Remote Profile   | `Profile.Visible` |
| Profile Link          | URL 목록, nullable           | 미정                                        | Local Profile    | `Profile.Visible` |

## 관계

| 관계                | 대상                                                          | 조건                               | 조회 권한                   |
| ------------------- | ------------------------------------------------------------- | ---------------------------------- | --------------------------- |
| Account membership  | [Account-Profile Membership](./account-profile-membership.md) | Local Profile 운영 권한 관계       | `Profile.Owner`             |
| avatar/header Media | [Media](./media.md)                                           | 현재 Profile 표현에 연결된 Media   | `Profile.Visible`           |
| 작성 Post           | [Post](./post.md)                                             | Profile이 Author Profile이다       | `Post.Visible`              |
| Follow Relationship | [Follow Relationship](./follow-relationship.md)               | 성립된 follower 또는 followee 관계 | `Profile.FollowListVisible` |
| Follow Request      | [Follow Request](./follow-request.md)                         | follower 또는 followee 요청        | `FollowRequest.Participant` |

## 행동

| 행동                | 행동 주체      | 대상 객체 | 입력값                              | 권한                                   | 결과                                                |
| ------------------- | -------------- | --------- | ----------------------------------- | -------------------------------------- | --------------------------------------------------- |
| Profile 생성        | Account        | Profile   | handle, 선택적 표시 이름            | `Account.Active`                       | Local Profile과 Owner membership이 생성된다         |
| Remote Profile 등록 | 시스템         | Profile   | Remote URL, qualified handle        | `Lookup.RemoteTargetEligible`          | Remote Profile이 활성 상태로 생성/갱신된다          |
| Profile 편집        | Account        | Profile   | 표시 이름, bio, avatar/header, 링크 | `Profile.Owner`, `Media.ProfileUsable` | Profile 표현 속성이 바뀐다                          |
| active Profile 선택 | Account        | Profile   | Profile                             | `Profile.ActiveMember`                 | 세션의 현재 행동 주체가 바뀐다                      |
| Profile 비활성화    | Account        | Profile   | 없음                                | `Profile.Owner`                        | 활성 Profile의 State가 비활성화가 된다              |
| Profile 재활성화    | Account        | Profile   | 없음                                | `Profile.Owner`                        | 비활성화 Profile의 State가 활성으로 돌아간다        |
| Profile 삭제        | Account        | Profile   | 없음                                | `Profile.Owner`                        | 비활성화 Profile의 State가 삭제됨이 된다            |
| Profile 정지        | 운영자 Account | Profile   | 사유                                | `Account.Operator`                     | Profile State가 정지가 되고 정지 전 상태를 보존한다 |
| Profile 정지 해제   | 운영자 Account | Profile   | 사유                                | `Account.Operator`                     | Profile이 정지 전 상태로 돌아간다                   |

## 권한

| 권한                        | 종류      | 성립 조건                                                          | 대표 참조                       |
| --------------------------- | --------- | ------------------------------------------------------------------ | ------------------------------- |
| `Profile.Visible`           | 객체 종속 | Profile이 활성이고 안전 정책에 의해 숨겨지지 않는다                | Profile 공개 조회               |
| `Profile.ActiveMember`      | 객체 종속 | Account가 활성 Local Profile과 `Owner` 또는 `Member` 관계를 가진다 | 소셜 행동, active Profile 선택  |
| `Profile.Owner`             | 객체 종속 | Account가 Local Profile의 `Owner` 관계를 가진다                    | Profile 편집, 이미지 연결, 삭제 |
| `Profile.FollowListVisible` | 객체 종속 | viewer가 관계 당사자이거나 Profile의 목록 공개 범위가 허용한다     | 팔로워/팔로잉 목록              |

## 불변 조건

- 로컬 handle은 로컬 네임스페이스에서 유일해야 한다.
- 같은 handle이라도 Host가 다르면 다른 Remote Profile이다.
- 비공개 서명 자료와 인증 토큰은 공개 Profile 정보가 아니다.
- Remote Profile은 Account membership을 가질 수 없다.
- active Profile은 현재 Account와 역할 관계가 있는 활성 Local Profile이어야 한다.
- Profile Origin은 생성 후 변경할 수 없다.
- 정지 상태는 운영자 action의 결과이며 `Owner` Account가 직접 해제할 수 없다.

## 확정 용어

- 프로필: Profile
- 로컬 프로필: Local Profile
- 원격 프로필: Remote Profile
- 표시 handle: Display Handle
- qualified handle: Qualified Handle
- 원격 원본 URL: Remote URL
- 팔로우 승인 정책: Follow Approval Policy

## 제외/보류

- Profile tag, theme, 계정 이동, 서버 이전은 현재 범위에서 제외한다.
