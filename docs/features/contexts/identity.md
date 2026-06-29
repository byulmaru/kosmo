# Identity 컨텍스트: 프로필과 계정 정체성

## 목표

Account, Profile, Local Profile, Remote Profile, 표시 handle, Account State, Profile State의 식별 기준과
생명주기를 정의한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: 없음. 다른 컨텍스트가 참조하는 정체성 기준이다.
- downstream: [Social Graph](./social-graph.md), [Publishing](./publishing.md), [Discovery](./discovery.md),
  [Notification](./notification.md)
- peer: [Media](./media.md), [Trust & Safety](./trust-safety.md)

## DDD 명세

- 컨텍스트 경계: Account, Profile, 표시 handle, 로컬/원격 Profile identity, Account State, Profile의
  팔로우 승인 정책, Profile 이미지 연결, 팔로워/팔로잉 목록 공개 범위를 정의한다. 게시, 팔로우 관계
  생명주기, 검색 색인, 운영 제재의 상세 규칙은 소유하지 않는다.
- 보편 언어: Account, Profile, Local Profile, Remote Profile, Handle, Display Handle, Remote Profile
  Identity, Account State, Profile State, Follow Approval Policy.
- 핵심 모델: Account와 Profile을 aggregate root 후보로 둔다. Account-Profile 관계는 역할과
  권한을 가진 관계로 본다.
- 값 객체 후보: Handle, Display Name, Bio, Profile URL, Remote URL, Host, Account Profile Role, Account
  State, Profile State.
- 불변 조건: 로컬 handle은 로컬 네임스페이스에서 유일해야 한다. 같은 handle이라도 host가 다르면
  다른 원격 프로필이다. 비공개 서명 자료와 인증 토큰은 공개 Profile 정보가 아니다. active
  Profile은 현재 Account와 역할 관계가 있는 활성 Profile이어야 한다. Account State와 Profile State는
  상태 기계에 정의된 전이로만 바뀔 수 있다.
- 도메인 이벤트 후보: AccountStateChanged, ProfileCreated, ProfileUpdated, ProfileStateChanged,
  HandleChanged, AccountProfileLinked.
- 정책 후보: handle 변경, 프로필 삭제와 계정 삭제 분리, 원격 프로필 캐시 최신성, 프로필 편집
  권한, 팔로우 승인 정책, 목록 공개 범위.

## 핵심 기능

### 계정

- 로그인의 주체다.
- 하나 이상의 Profile과 역할 관계를 가질 수 있다.
- 인증 수단의 구체 구현은 Identity 도메인 명세에서 정의하지 않는다.
- 계정 삭제와 프로필 삭제는 서로 다른 생명주기로 다룬다.
- Account 삭제 전에는 해당 Account가 가진 Account-Profile 관계를 정리해야 한다.
- Account-Profile 관계 정리 과정에서 어떤 Profile의 마지막 `Owner`도 제거할 수 없다.
- 계정 정지는 Account 상태이고 프로필 정지는 Profile 상태다.

## Account 상태

- 활성: Account가 인증, 보안 설정, Profile 전환의 대상이 될 수 있는 상태.
- 정지: Trust & Safety의 moderation action으로 Account 사용이 정지된 상태.
- 삭제됨: 재활성화할 수 없는 terminal 상태.

### Account State Machine

Account State는 활성, 정지, 삭제됨 세 상태를 가진다. 삭제됨은 terminal 상태이며 다른 상태로 되돌릴 수
없다.

| 현재 상태      | 전이                | 수행 주체      | 다음 상태 | 규칙                                                                        |
| -------------- | ------------------- | -------------- | --------- | --------------------------------------------------------------------------- |
| 없음           | Account 생성        | Account        | 활성      | 생성된 Account는 인증과 Profile 생성의 기준이 된다                          |
| 활성           | Account 정지        | Trust & Safety | 정지      | Profile 전환과 Account 기준 소셜 행동을 수행할 수 없다                      |
| 정지           | Account 정지 해제   | Trust & Safety | 활성      | 정지 해제는 Trust & Safety moderation action의 결과다                       |
| 활성 또는 정지 | Account 삭제        | Account        | 삭제됨    | Account-Profile 관계가 모두 정리되어야 하며 마지막 `Owner`를 없애면 안 된다 |
| 삭제됨         | 모든 상태 변경 요청 | 없음           | 삭제됨    | 삭제됨은 되돌릴 수 없다                                                     |

정지 상태는 Trust & Safety가 소유한 moderation action의 결과이며, Account가 직접 해제할 수 없다.

### 프로필

- 공개적으로 보이는 소셜 정체성이다.
- 표시 이름, handle, bio, avatar, header image, 링크, 생성일을 가진다.
- 프로필은 로컬 프로필과 원격 프로필로 나뉠 수 있다.
- 로컬 프로필은 우리 서비스에서 직접 관리하는 프로필이다.
- Remote Profile은 외부 Host가 원본인 Profile 표현이다.

### 표시 이름과 handle

- 표시 이름은 사람이 읽는 이름이며 중복될 수 있다.
- handle은 같은 Host 안에서 Profile을 식별하는 이름이며 URL, 멘션, 검색에 쓰인다.
- qualified handle은 handle과 Host로 이루어지며, `@handle@host` 형식이다.
- 원격 Profile 식별은 qualified handle과 Remote URL을 함께 사용한다.
- handle은 같은 Host 내에서 중복될 수 없다.

### 프로필 편집

- Profile의 `Owner` Account는 표시 이름, bio, avatar, header image, 링크를 수정할 수 있다.
- 현재 Profile에 연결된 avatar/header Media 참조는 Identity가 소유한다.
- avatar/header의 파일 원본, crop 기준, 파생 이미지는 Media가 소유한다.
- Profile 표현을 소비하는 컨텍스트는 Identity가 소유한 현재 Profile 표현을 참조한다.

### Account-Profile 관계

- Account-Profile 관계는 역할 기반 관계 모델이다.
- 하나의 Account는 여러 Profile과 연결될 수 있다.
- 하나의 Profile은 여러 Account와 역할 기반으로 연결될 수 있다.
- Account-Profile 관계는 role, 상태, 연결 시각을 가진다.
- Account-Profile role은 `Owner`와 `Member` 두 가지로 둔다.
- `Owner`는 Profile 삭제, role 변경, Account 초대, Owner 지위 양도, Profile 전환을 수행할 수 있고,
  해당 Profile을 active Profile로 선택해 소셜 행동을 수행할 수 있다.
- `Member`는 Profile 전환을 수행할 수 있고, 해당 Profile을 active Profile로 선택해 소셜 행동을
  수행할 수 있다.
- `Member`는 Profile 편집, Profile 삭제, role 변경, Account 초대, Owner 지위 양도를 수행할 수 없다.
- `Owner`와 `Member`는 Profile 운영 권한과 소셜 행동 권한을 분리한다.
- 초대는 `Owner`가 다른 Account를 해당 Profile의 역할 관계에 추가하는 행동이다.
- Owner 지위 양도는 다른 Account를 `Owner`로 만들거나 `Owner` 지위를 이전하는 행동이다.
- Profile 생성, 편집, 삭제, 전환은 Account-Profile role이 허용하는 권한으로 판단한다.
- active Profile은 Account 세션에서 선택한 현재 행동 주체이며, 소셜 행동은 active Profile 기준으로
  수행한다.
- 인증, 보안 설정, Profile의 Owner/Member 권한 관리는 Account 기준으로 수행한다.
- Profile에는 항상 최소 1명의 `Owner`가 있어야 한다.
- `Owner`만 초대, role 변경, Owner 지위 양도를 수행할 수 있다.
- 마지막 `Owner`는 탈퇴, role 변경, 연결 해제할 수 없다.

## 프로필 상태

- 활성: Profile이 표시와 소셜 행동의 대상이 될 수 있는 상태.
- 비활성화: `Owner` Account가 재활성화할 수 있지만 active Profile로 선택할 수 없는 상태.
- 정지: Trust & Safety의 moderation action으로 Profile 사용과 표시가 정지된 상태.
- 삭제됨: 재활성화할 수 없는 terminal 상태.

### Profile State Machine

Profile State는 활성, 비활성화, 정지, 삭제됨 네 상태를 가진다. 삭제됨은 terminal 상태이며 다른
상태로 되돌릴 수 없다.

| 현재 상태          | 전이                | 수행 주체       | 다음 상태      | 규칙                                                                  |
| ------------------ | ------------------- | --------------- | -------------- | --------------------------------------------------------------------- |
| 없음               | Profile 생성        | Account         | 활성           | 생성한 Account는 Profile의 `Owner`가 된다                             |
| 활성               | Profile 비활성화    | `Owner` Account | 비활성화       | active Profile로 선택할 수 없고 소셜 행동을 수행할 수 없다            |
| 비활성화           | Profile 재활성화    | `Owner` Account | 활성           | 정지 상태가 아니어야 한다                                             |
| 활성 또는 비활성화 | Profile 정지        | Trust & Safety  | 정지           | 정지 전 상태를 복구 대상 상태로 보존한다                              |
| 정지               | Profile 정지 해제   | Trust & Safety  | 정지 전 상태   | 정지 전 상태가 활성 또는 비활성화였는지에 따라 복구한다               |
| 비활성화           | Profile 삭제        | `Owner` Account | 삭제됨         | 삭제 전에 Profile은 비활성화 상태여야 한다                            |
| 활성 또는 정지     | Profile 삭제 요청   | `Owner` Account | 현재 상태 유지 | 삭제하려면 먼저 비활성화되어야 하며, 정지 상태는 정지 해제가 필요하다 |
| 삭제됨             | 모든 상태 변경 요청 | 없음            | 삭제됨         | 삭제됨은 되돌릴 수 없다                                               |

정지 상태는 Trust & Safety가 소유한 moderation action의 결과이며, `Owner` Account가 직접 해제할 수 없다.
Publishing, Post List, Discovery, Notification은 Profile State를 재정의하지 않고 Identity가 제공하는
상태와 Trust & Safety의 moderation 결과를 소비한다.

## 팔로우 요청 승인 여부

Profile은 팔로우 승인 정책을 가진다. Social Graph는 이 값을 참조해 Follow Relationship을 즉시
수락하거나 요청 대기 상태로 둔다.

- 자유: 다른 Profile이 해당 Profile을 팔로우하면 승인 절차 없이 Follow Relationship이 생성된다.
- 승인제: 다른 Profile이 해당 Profile을 팔로우하면 Follow Relationship이 요청 대기 상태가 된다.

## 목록 공개 범위

- Profile은 팔로워 목록 공개 범위와 팔로잉 목록 공개 범위를 별도로 가진다.
- Social Graph는 Identity의 목록 공개 범위를 참조해 팔로워/팔로잉 목록 접근을 판단한다.

## 입력 정책

- 로컬 handle은 3자 이상 30자 이하이며 영문, 숫자, 밑줄만 허용한다.
- `.`은 handle 문자로 허용하지 않고 예약 문자로 둔다.
- 표시 이름은 1자 이상 40자 이하로 둔다.
- bio는 비워둘 수 있으며 500자 이하로 둔다.
- 로컬 프로필은 상태, 표시 handle, 검색/비교용 정규화 handle, 표시 이름, bio, 팔로우 승인
  정책, 생성 시각을 가진다.
- 로컬 프로필 생성 시 최소 입력은 handle이며, 표시 이름은 handle을 기본값으로 삼을 수 있다.
- 프로필 편집 권한은 해당 프로필의 `Owner` 역할을 기준으로 판단한다.
- avatar, header image, Profile Link는 Profile 표현 속성이다.

## 확정된 용어

- 계정: Account
- 프로필: Profile
- 원격 프로필: Remote Profile
- 표시 handle: Display Handle
- qualified handle: Qualified Handle
- 원격 원본 URL: Remote URL
- 팔로우 승인 정책: Follow Approval Policy
