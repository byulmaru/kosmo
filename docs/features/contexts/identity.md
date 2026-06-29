# Identity 컨텍스트: 프로필과 계정 정체성

## 목표

Profile이 자신을 표현하고, 다른 Profile을 안정적으로 식별하고, 로컬/원격 프로필을 혼동하지 않게
해야 한다. Kosmo는 Account와 Profile을 분리하는 구조를 이미 갖고 있으므로 제품 스펙도 Account,
Profile, 표시 handle, Remote Profile identity를 구분한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: 없음. 다른 컨텍스트가 참조하는 정체성 기준이다.
- downstream: [Social Graph](./social-graph.md), [Publishing](./publishing.md), [Discovery](./discovery.md),
  [Notification](./notification.md)
- peer: [Media](./media.md), [Trust & Safety](./trust-safety.md)

## DDD 명세

- 컨텍스트 경계: Account, Profile, 표시 handle, 로컬/원격 Profile identity, Profile의 팔로우 승인
  정책을 정의한다. 게시, 팔로우 관계 생명주기, 검색 색인, 운영 제재의 상세 규칙은 소유하지 않는다.
- 보편 언어: Account, Profile, Local Profile, Remote Profile, Handle, Display Handle, Remote Profile
  Identity, Profile State, Follow Approval Policy.
- 핵심 모델: Account와 Profile을 aggregate root 후보로 둔다. Account-Profile 소유 관계는 역할과
  권한을 가진 관계로 본다.
- 값 객체 후보: Handle, Display Name, Bio, Profile URL, Remote URL, Host, Account Profile Role, Profile
  State.
- 불변 조건: 로컬 handle은 로컬 네임스페이스에서 유일해야 한다. 같은 handle이라도 host가 다르면
  다른 원격 프로필이다. private signing material과 인증 토큰은 공개 프로필 정보가 아니다. active
  Profile은 현재 Account와 역할 관계가 있는 Profile이어야 한다.
- 도메인 이벤트 후보: ProfileCreated, ProfileUpdated, ProfileStateChanged, HandleChanged,
  AccountProfileLinked.
- 정책 후보: handle 변경, 프로필 삭제와 계정 삭제 분리, 원격 프로필 캐시 최신성, 프로필 편집
  권한, 팔로우 승인 정책.

## 핵심 기능

### 계정

- 로그인의 주체다.
- 하나 이상의 프로필을 소유할 수 있다.
- 이메일, OAuth, 패스키 같은 인증 수단은 OIDC 구현에 의존한다.
- 계정 삭제와 프로필 삭제는 서로 다른 생명주기로 다룬다.
- Profile이 남아 있으면 Account를 삭제할 수 없다.
- 계정 정지는 Account 상태이고 프로필 정지는 Profile 상태다.

### 프로필

- 공개적으로 보이는 소셜 정체성이다.
- 표시 이름, handle, bio, avatar, header image, 링크, 생성일을 가진다.
- 프로필은 로컬 프로필과 원격 프로필로 나뉠 수 있다.
- 로컬 프로필은 우리 서비스에서 직접 관리하는 프로필이다.
- 원격 프로필은 ActivityPub 등의 원격 프로토콜을 통해 캐시된 Profile이다.

### 표시 이름과 handle

- 표시 이름은 사람이 읽는 이름이며 중복될 수 있다.
- handle은 한 instance 안에서 Profile을 식별하는 local part이며 URL, 멘션, 검색에 쓰인다.
- qualified handle은 handle과 instance host로 이루어지며, `@handle@instance-host` 형식이다.
- 원격 Profile 식별은 qualified handle과 remote URL을 함께 사용한다.
- handle은 같은 instance 내에서 중복될 수 없다.

### 프로필 편집

- Profile 소유 Account는 표시 이름, bio, avatar, header image, 링크를 수정할 수 있다.
- 변경 사항은 프로필 페이지, 사이드바, 게시 작성자 표시, 검색 결과에 반영되어야 한다.

### Account-Profile 관계

- Account-Profile 관계는 역할 기반 소유 모델이다.
- 하나의 Account는 여러 Profile과 연결될 수 있다.
- 하나의 Profile은 여러 Account와 역할 기반으로 연결될 수 있다.
- Account-Profile 관계는 role, 상태, 연결 시각을 가진다.
- Account-Profile role은 `Owner`와 `Member` 두 가지로 둔다.
- `Owner`는 Profile 삭제, role 변경, Account 초대, 소유권 양도, Profile 전환, 소셜 행동을 수행할 수
  있다.
- `Member`는 Profile 전환과 소셜 행동을 수행할 수 있다.
- `Owner`와 `Member` 구분은 하나의 Profile을 여러 Account가 함께 소유하거나 운영할 때 삭제와 권한
  변경 권한을 분리하기 위해 필요하다.
- 초대는 `Owner`가 다른 Account를 해당 Profile의 역할 관계에 추가하는 행동이다.
- 소유권 양도는 다른 Account를 `Owner`로 만들거나 `Owner` 지위를 이전하는 행동이다.
- Profile 생성, 편집, 삭제, 전환은 Account-Profile role이 허용하는 권한으로 판단한다.
- active Profile은 Account 세션에서 선택한 현재 행동 주체이며, 소셜 행동은 active Profile 기준으로
  수행한다.
- 인증, 보안 설정, Profile 소유와 권한 관리는 Account 기준으로 수행한다.
- Profile에는 항상 최소 1명의 `Owner`가 있어야 한다.
- `Owner`만 초대, role 변경, 양도를 수행할 수 있다.
- 마지막 `Owner`는 탈퇴, role 변경, 연결 해제할 수 없다.

## 프로필 상태

- 활성: 정상 표시.
- 비활성화: 프로필이 비활성화되었지만 다시 활성화가 될 가능성이 존재하는 경우
- 정지: Trust & Safety의 moderation action으로 Profile 사용과 표시가 정지된 경우
- 삭제됨: 프로필이 비활성화되었으며 다시 활성화가 될 가능성이 없어 안전하게 정보를 삭제 가능한 경우

## 팔로우 요청 승인 여부

Profile은 팔로우 승인 정책을 가진다. Social Graph는 이 값을 참조해 Follow Relationship 또는 Follow
Request를 생성한다.

- 자유: 다른 Profile이 해당 Profile을 팔로우하면 승인 절차 없이 Follow Relationship이 생성된다.
- 승인제: 다른 Profile이 해당 Profile을 팔로우하면 Follow Request가 생성된다.

## 입력 정책

- 로컬 handle은 3자 이상 30자 이하이며 영문, 숫자, 밑줄만 허용한다.
- `.`은 handle 문자로 허용하지 않고 향후 호환성을 위해 예약한다.
- 표시 이름은 1자 이상 40자 이하로 둔다.
- bio는 비워둘 수 있으며 500자 이하로 둔다.
- 로컬 프로필은 상태, 표시 handle, 검색/비교용 정규화 handle, 표시 이름, bio, 팔로우 승인
  정책, 생성 시각을 가진다.
- 로컬 프로필 생성 시 최소 입력은 handle이며, 표시 이름은 handle을 기본값으로 삼을 수 있다.
- 프로필 편집 권한은 해당 프로필의 `Owner` 역할을 기준으로 판단한다.
- avatar, header image, Profile links는 프로필 표현 속성이다.

## 확정된 용어

- 계정: Account
- 프로필: Profile
- 원격 프로필: Remote Profile
- 표시 handle: Display Handle
- qualified handle: Qualified Handle
- 원격 원본 URL: Remote URL
- 팔로우 승인 정책: Follow Approval Policy
