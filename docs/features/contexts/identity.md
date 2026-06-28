# Identity 컨텍스트: 프로필과 계정 정체성

## 목표

Profile이 자신을 표현하고, 다른 Profile을 안정적으로 식별하고, 로컬/원격 프로필을 혼동하지 않게
해야 한다. Kosmo는 Account와 Profile을 분리하는 구조를 이미 갖고 있으므로 제품 스펙도 Account,
Profile, 표시 handle, Remote Profile identity를 구분한다.

## 컨텍스트 관계

- 상위: [DDD 도메인 명세 인덱스](../README.md)
- upstream: 없음. 다른 컨텍스트가 참조하는 정체성 기준이다.
- downstream: [Social Graph](./social-graph.md), [Publishing](./publishing.md),
  [Discovery](./discovery.md), [Notification](./notification.md)
- peer: [Media](./media.md), [Trust & Safety](./trust-safety.md)

## DDD 명세

- 컨텍스트 경계: Account, Profile, 표시 handle, 로컬/원격 Profile identity를 정의한다. 게시, 팔로우,
  검색 색인, 운영 제재의 상세 규칙은 소유하지 않는다.
- 보편 언어: Account, Profile, Local Profile, Remote Profile, Handle, Display Handle, Remote Profile
  Identity, Profile State.
- 핵심 모델: Account와 Profile을 aggregate root 후보로 둔다. Account-Profile 소유 관계는 역할과
  권한을 가진 관계로 본다.
- 값 객체 후보: Handle, Display Name, Bio, Profile URL, Remote URL, Host, Account Profile Role.
- 불변 조건: 로컬 handle은 로컬 네임스페이스에서 유일해야 한다. 같은 handle이라도 host가 다르면
  다른 원격 프로필이다. private signing material과 인증 토큰은 공개 프로필 정보가 아니다. active
  Profile은 현재 Account와 역할 관계가 있는 Profile이어야 한다.
- 도메인 이벤트 후보: ProfileCreated, ProfileUpdated, ProfileStateChanged, HandleChanged,
  AccountProfileLinked.
- 정책 후보: handle 변경, 프로필 삭제와 계정 삭제 분리, 원격 프로필 캐시 최신성, 프로필 편집
  권한.

## 핵심 기능

### 계정

- 로그인의 주체다.
- 하나 이상의 프로필을 소유할 수 있다.
- 이메일, OAuth, 패스키 같은 인증 수단은 OIDC 구현에 의존한다.
- 계정 삭제와 프로필 삭제는 분리해서 정책을 정해야 한다.
- 역할 기반 Profile 관리에서 마지막 소유자 역할을 제거할 수 있는지 정해야 한다.
- 계정 정지와 프로필 정지는 운영 정책상 별도 상태가 될 수 있다.

### 프로필

- 공개적으로 보이는 소셜 정체성이다.
- 표시 이름, handle, bio, avatar, header image, 링크, 생성일, 고정 Post를 가진다.
- 프로필은 로컬 프로필과 원격 프로필로 나뉠 수 있다.
- 로컬 프로필은 우리 서비스에서 직접 관리하는 프로필이다.
- 원격 프로필은 ActivityPub 등의 원격 프로토콜을 통해 캐시된 Profile이다.

### 표시 이름과 handle

- 표시 이름은 사람이 읽는 이름이며 중복될 수 있다.
- handle은 URL, 멘션, 검색, 연합 식별에 쓰인다.
- fullHandle은 handle과 instance host로 이루어지며, `@handle@instance-host` 형식이다.
- handle은 같은 instance 내에서 중복될 수 없다.

### 프로필 편집

- Profile 소유 Account는 표시 이름, bio, avatar, header image, 링크를 수정할 수 있다.
- 변경 사항은 프로필 페이지, 사이드바, 게시 작성자 표시, 검색 결과에 반영되어야 한다.

### Account-Profile 관계

- Account-Profile 관계는 역할 기반 소유 모델이다.
- 하나의 Account는 여러 Profile과 연결될 수 있다.
- 하나의 Profile은 여러 Account와 역할 기반으로 연결될 수 있다.
- Account-Profile 관계는 role, 상태, 연결 시각을 가진다.
- Profile 생성, 편집, 삭제, 전환은 Account-Profile role이 허용하는 권한으로 판단한다.
- active Profile은 Account 세션에서 선택한 현재 행동 주체이며, 소셜 행동은 active Profile 기준으로
  수행한다.
- 인증, 보안 설정, Profile 소유와 권한 관리는 Account 기준으로 수행한다.
- 역할 이름, 권한 매트릭스, 초대/양도, 마지막 소유자 제거 가능 여부는 별도 결정이 필요하다.

## 프로필 상태

- 활성: 정상 표시.
- 비활성화: 프로필이 비활성화되었지만 다시 활성화가 될 가능성이 존재하는 경우
- 삭제됨: 프로필이 비활성화되었으며 다시 활성화가 될 가능성이 없어 안전하게 정보를 삭제 가능한 경우

## 팔로우 요청 승인 여부

- 자유: 타 프로필이 해당 프로필을 대상으로 팔로우 동작시 승인 절차 없이 팔로우 관계가 생성됨.
- 승인제: 타 프로필이 해당 프로필을 대상으로 팔로우 동작시 팔로우 요청이 생성됨.

## 선택 기능

### 프로필 테마

- 선택한 프로필에 따라 UI의 테마를 변경해서 보여준다.

## 입력 정책 후보

// TODO: 확정할것!

- 로컬 handle은 3자 이상 30자 이하이며 영문, 숫자, 밑줄만 허용하는 정책을 후보로 둔다.
- 표시 이름은 1자 이상 80자 이하 정책을 후보로 둔다.
- bio는 비워둘 수 있으며 500자 이하 정책을 후보로 둔다.
- 로컬 프로필은 상태, 표시 handle, 검색/비교용 정규화 handle, 표시 이름, bio, 팔로우 승인
  정책, 생성 시각을 가진다.
- 로컬 프로필 생성 시 최소 입력은 handle이며, 표시 이름은 handle을 기본값으로 삼을 수 있다.
- 프로필 편집 권한은 해당 프로필의 소유자 또는 관리자 역할을 기준으로 판단한다.
- avatar, header image, Profile links, featured Profiles, featured tags는 프로필 표현 확장 속성으로
  별도 제품 범위를 정한다.

## 미결정 네이밍

- 계정: Account
- 표시 handle: displayHandle, qualifiedHandle, acctHandle
- 원본 URL: canonicalUrl, remoteUrl
- 승인제 프로필: Locked, Protected, Follow approval required

## 확정된 용어

- 프로필: Profile
- 원격 프로필: Remote Profile
