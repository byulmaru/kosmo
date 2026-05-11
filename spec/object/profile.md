# 프로필 오브젝트 스펙

## 목적

프로필은 kosmo에서 게시물 작성, 팔로우, 타임라인 노출의 주체가 되는 사회적 정체성이다.
하나의 계정은 여러 프로필을 소유하거나 관리할 수 있고, 하나의 프로필은 여러 계정이 역할을 나누어 관리할 수 있다.

프로필은 로그인 단위인 계정과 분리된다. 계정은 OIDC 인증 주체이고, 프로필은 사용자가 외부에 드러내는 활동 주체다.

## 현재 범위

MVP에서는 다음 기능을 프로필 스펙의 범위로 둔다.

- 프로필 생성, 조회, 수정, 비활성화
- 계정과 프로필의 N:N 소유/관리 관계
- 요청을 수행하는 현재 활성 프로필 선택
- 프로필 간 팔로우 요청과 승인
- 프로필이 작성한 게시물과의 관계
- 프로필 아바타와 배너 노출

다음 기능은 제품 MVP에 필요하지만, 프로필 기본 오브젝트 스펙에서는 별도 GraphQL 스펙으로 분리한다.

- 프로필 태그 직접 추가/삭제, 공개 표시, 태그 검색, 태그 뮤트
- 프로필별 테마 프리셋, 포인트 컬러, 레이아웃

다음 기능은 MVP 이후로 미룬다.

- 커스텀 필드
- ActivityPub Actor 세부 필드
- AT Protocol record/cache 연결
- 프로필 차단, 뮤트, 신고, moderation audit
- 프로필 삭제 복구 정책과 tombstone federation

## GraphQL 오브젝트

### `Profile`

프로필의 공개 표현이다. GraphQL API에서 노출할 필드를 기준으로 정의한다.

| 필드               | 타입                       | 필수   | 인수                        | 공개 조회 | 설명                                                                                    |
| ------------------ | -------------------------- | ------ | --------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `id`               | `ID`                       | 예     | -                           | ✅        | Relay Node ID. 클라이언트는 내부 UUID 구조에 의존하지 않는다.                           |
| `handle`           | `String`                   | 예     | -                           | ✅        | 프로필의 고유 핸들. MVP에서는 로컬 서비스 안에서 unique여야 한다.                       |
| `displayName`      | `String`                   | 예     | -                           | ✅        | 화면에 표시할 이름.                                                                     |
| `bio`              | `String`                   | 아니오 | -                           | ✅        | 자기소개.                                                                               |
| `avatarUrl`        | `String`                   | 아니오 | -                           | ✅        | 프로필 아바타 API 표현 필드. 미디어 API가 확정되기 전 MVP 임시 표현으로 둔다.           |
| `bannerUrl`        | `String`                   | 아니오 | -                           | ✅        | 프로필 배너 API 표현 필드. 미디어 API가 확정되기 전 MVP 임시 표현으로 둔다.             |
| `followPolicy`     | `FollowPolicy`             | 예     | -                           | ✅        | 팔로우 요청 처리 정책. 게시물 공개 범위와 분리한다.                                     |
| `viewerRole`       | `ProfileRole`              | 아니오 | -                           | ❌        | 현재 viewer 계정이 이 프로필에 대해 가지는 역할. 인증된 viewer에게만 계산해서 반환한다. |
| `viewerFollowing`  | `ProfileFollow`            | 아니오 | -                           | ❌        | 현재 actor profile이 이 프로필을 팔로우하는 관계. 인증된 actor가 있을 때만 반환한다.    |
| `viewerFollowedBy` | `ProfileFollow`            | 아니오 | -                           | ❌        | 이 프로필이 현재 actor profile을 팔로우하는 관계. 인증된 actor가 있을 때만 반환한다.    |
| `followers`        | `ProfileFollowConnection!` | 예     | `first: Int, after: String` | ✅        | 이 프로필을 팔로우하는 관계 목록. Relay Connection 스타일로 페이지네이션한다.           |
| `following`        | `ProfileFollowConnection!` | 예     | `first: Int, after: String` | ✅        | 이 프로필이 팔로우하는 관계 목록. Relay Connection 스타일로 페이지네이션한다.           |
| `posts`            | `PostConnection!`          | 예     | `first: Int, after: String` | ✅        | 이 프로필이 작성한 게시물 목록. 세부 타입은 Post GraphQL 스펙에서 정의한다.             |
| `createdAt`        | `DateTime`                 | 예     | -                           | ✅        | 프로필 생성 시각. 프로필 화면의 가입 시점 표시에 사용한다.                              |

규칙:

- `handle`은 외부 식별자다. GraphQL Relay ID와는 별도 책임으로 둔다.
- `handle`은 변경 가능성이 있는 사용자명이다. ActivityPub federation의 canonical identity는 actor `id` URI로 두고, handle은 `preferredUsername`과 WebFinger `acct:` lookup에 대응하는 발견/표시용 식별자로 취급한다.
- `handle` 변경은 MVP에서 별도 mutation으로 제공한다. 변경 후에도 ActivityPub actor `id` URI는 유지한다.
- MVP GraphQL API에서는 handle 도메인을 별도 필드나 오브젝트로 노출하지 않는다.
- 프로필 생명주기 상태는 공개 `Profile` 필드로 기본 노출하지 않는다. 상태별 조회와 복구 정책은 별도 관리 스펙에서 정의한다.
- `avatarUrl`, `bannerUrl`은 API 표현 필드다. 원본 파일 접근 URL을 그대로 노출하지 않는다.

### `AccountProfile`

계정과 프로필의 관리 관계를 나타내는 GraphQL 표현이다.
viewer가 자기 계정 아래에서 조회할 때는 `account` 필드를 생략하고 `profile`과 `role`만 반환할 수 있다.

| 필드      | 타입          | 필수 | 설명                                   |
| --------- | ------------- | ---- | -------------------------------------- |
| `profile` | `Profile`     | 예   | 연결된 프로필.                         |
| `role`    | `ProfileRole` | 예   | 현재 계정이 프로필에 대해 가지는 역할. |

MVP에서는 프로필 생성자가 `OWNER` 역할을 가진 `AccountProfile` 관계를 함께 가진다.

역할:

| 값       | 의미                                                                       |
| -------- | -------------------------------------------------------------------------- |
| `OWNER`  | 프로필의 최상위 관리자. 프로필 삭제/비활성화, 역할 관리 권한을 가진다.     |
| `ADMIN`  | 프로필 운영자. 프로필 정보 수정과 게시 권한을 가진다.                      |
| `MEMBER` | 제한된 멤버. 게시 또는 프로필 선택 권한을 가질 수 있으나 관리 권한은 없다. |

### `ProfileFollow`

프로필 간 팔로우 관계의 GraphQL 표현이다.

| 필드          | 타입                 | 필수   | 설명                   |
| ------------- | -------------------- | ------ | ---------------------- |
| `id`          | `ID`                 | 예     | 팔로우 관계의 Node ID. |
| `follower`    | `Profile`            | 예     | 팔로우를 거는 프로필.  |
| `followee`    | `Profile`            | 예     | 팔로우 대상 프로필.    |
| `state`       | `ProfileFollowState` | 예     | 팔로우 요청 상태.      |
| `createdAt`   | `DateTime`           | 예     | 요청 생성 시각.        |
| `respondedAt` | `DateTime`           | 아니오 | 승인 또는 거절 시각.   |

제약:

- 같은 follower/followee pair에는 하나의 팔로우 관계만 존재한다.
- 자기 자신을 팔로우할 수 없다.
- 팔로워 목록은 `followee` 기준으로 조회한다.
- 팔로잉 목록은 `follower` 기준으로 조회한다.

상태:

| 값         | 의미                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| `PENDING`  | 승인 대기 중. 대상 프로필의 `followPolicy = APPROVAL_REQUIRED`일 때 생성된다. |
| `ACCEPTED` | 팔로우 성립. 대상 프로필의 `followPolicy = OPEN`이면 즉시 이 상태가 된다.     |
| `REJECTED` | 팔로우 거절. 동일 pair 재요청 정책은 별도 product decision으로 둔다.          |

## 조회 권한

### 공개 조회

인증 없이도 `ACTIVE` 프로필의 `Profile` 필드 테이블에서 공개 조회가 `✅`인 필드를 조회할 수 있다.
비활성화된 프로필은 공개 조회에서 반환하지 않는다.

프로필 태그와 테마는 제품 MVP의 핵심 기능이지만, 공개 조회 필드와 API 형태는 별도 스펙에서 정의한다.
federation actor URL은 ActivityPub 구현 시점에 공개 여부를 별도 결정한다.

### 인증 조회

인증된 계정은 자신이 연결된 프로필에 대해 다음 정보를 추가로 조회할 수 있다.

- `viewerRole`
- 현재 세션의 active profile 여부
- 현재 actor profile이 해당 프로필을 팔로우하는 관계 상태
- 해당 프로필이 현재 actor profile을 팔로우하는 관계 상태

다른 계정의 프로필 관리 관계 목록은 기본적으로 공개하지 않는다.

## 요청 컨텍스트

API 요청의 actor profile은 다음 순서로 결정한다.

1. `Authorization: Bearer <token>`으로 active session을 찾는다.
2. `X-Actor-Profile-Id` 헤더가 있으면 해당 프로필을 actor 후보로 사용한다.
3. 헤더가 없으면 현재 세션의 active profile을 actor 후보로 사용한다.
4. 후보 프로필을 현재 계정이 관리할 수 있고 `state = ACTIVE`일 때만 actor로 확정한다.
5. 조건을 만족하지 않으면 actor profile은 `null`이다.

프로필을 actor로 요구하는 mutation은 요청 컨텍스트에 확정된 actor profile이 없으면 실패해야 한다.

## Mutation 권한

### `createProfile`

새 프로필을 만들고 요청 계정을 `OWNER`로 연결한다.

필수 입력:

- `handle`

선택 입력:

- `displayName`
- `bio`
- `avatarUrl`
- `bannerUrl`
- `followPolicy`

기본값:

- `displayName`이 없으면 정규화된 `handle`을 사용한다.
- `followPolicy`가 없으면 `APPROVAL_REQUIRED`를 사용한다.
- `bio`, `avatarUrl`, `bannerUrl`이 없으면 `null`로 저장한다.

권한:

- 인증된 계정만 호출할 수 있다.

검증:

- `handle`은 정규화 후 로컬 서비스 안에서 unique여야 한다.
- `displayName`은 빈 문자열이면 안 된다.
- `bio`는 빈 문자열을 `null`로 정규화할 수 있다.
- `avatarUrl`, `bannerUrl`은 API 입력/출력 표현 필드다. 미디어 API가 들어오기 전까지는 임시 URL만 받는다.
- 원본 파일 접근 URL을 그대로 노출하지 않는다.

효과:

- 새 `Profile`을 생성한다.
- 같은 요청 안에서 요청 계정의 `AccountProfile`을 `OWNER` role로 생성한다.

### `updateProfile`

프로필의 표시 정보를 수정한다.

수정 가능 필드:

- `displayName`
- `bio`
- `avatarUrl`
- `bannerUrl`
- `followPolicy`

권한:

- 해당 프로필의 `OWNER` 또는 `ADMIN`만 호출할 수 있다.

입력 필드 의미:

- 필드가 생략되면 기존 값을 변경하지 않는다.
- nullable 필드에 `null`을 명시하면 값을 비운다.
- non-null 필드에 값을 명시하면 해당 값으로 갱신한다.
- `displayName`은 `null`로 지울 수 없고 빈 문자열이면 안 된다.
- `followPolicy`는 `null`로 지울 수 없다.

`handle`은 `updateProfile`에 포함하지 않고 `changeProfileHandle` mutation으로 변경한다.

### `changeProfileHandle`

프로필의 `handle`을 변경한다.
handle 변경은 ActivityPub actor identity 변경이 아니라 `preferredUsername`과 WebFinger `acct:` lookup 값 변경으로 취급한다.

입력:

- `profileId`
- `handle`

권한:

- 해당 프로필의 `OWNER`만 호출할 수 있다.
- 대상 프로필은 `ACTIVE` 상태여야 한다.

검증:

- 새 `handle`은 정규화 후 로컬 서비스 안에서 unique여야 한다.
- 허용 문자와 길이 정책은 `createProfile`의 `handle` 정책과 동일하게 적용한다.

효과:

- `Profile.handle`을 새 값으로 변경한다.
- ActivityPub actor `id` URI는 변경하지 않는다.
- `profileByHandle(handle:)`은 변경 후 새 `handle` 기준으로 조회한다.

### `disableProfile`

프로필을 비활성화한다.

권한:

- 해당 프로필의 `OWNER`만 호출할 수 있다.

효과:

- 프로필의 내부 생명주기 상태를 `DISABLED`로 변경한다.
- 비활성화된 프로필은 새 게시물 작성, 팔로우 요청, 공개 조회 대상에서 제외된다.

MVP에서는 물리 삭제하지 않는다. 복구 가능한 삭제와 federation tombstone은 삭제 정책이 정해진 뒤 후속 설계로 남긴다.

### `setActiveProfile`

세션의 기본 actor profile을 바꾼다.

입력:

- `profileId`

권한:

- 인증된 계정이 해당 프로필을 관리할 수 있어야 한다.
- 해당 프로필은 `ACTIVE`여야 한다.

효과:

- 현재 세션의 active profile을 입력 프로필로 변경한다.

### `followProfile`

현재 actor profile이 대상 프로필을 팔로우한다.

입력:

- `profileId`: 팔로우 대상 프로필

권한:

- actor profile이 필요하다.
- actor profile과 대상 profile 모두 `ACTIVE`여야 한다.

검증:

- 자기 자신을 팔로우할 수 없다.
- 이미 같은 follower/followee pair가 있으면 기존 `ProfileFollow`의 상태를 기준으로 응답한다.

효과:

- 대상 프로필의 `followPolicy = OPEN`이면 `state = ACCEPTED`인 `ProfileFollow`를 만든다.
- 대상 프로필의 `followPolicy = APPROVAL_REQUIRED`이면 `state = PENDING`인 `ProfileFollow`를 만든다.

### `unfollowProfile`

현재 actor profile이 맺은 팔로우 관계를 취소한다.

입력:

- `followId`: 취소할 팔로우 관계

권한:

- actor profile이 필요하다.
- actor profile은 `ACTIVE` 상태여야 한다.
- 입력한 `ProfileFollow.follower`가 현재 actor profile이어야 한다.

효과:

- `ProfileFollow`를 삭제한다.
- 감사 로그나 federation 호환성 때문에 이력을 보존해야 하면 후속 스펙에서 soft delete 또는 취소 상태를 별도로 정의한다.

### `respondProfileFollow`

팔로우 요청을 승인하거나 거절한다.

입력:

- `followId`
- `response`: `ACCEPTED` 또는 `REJECTED`

권한:

- 인증된 계정이 필요하다.
- actor profile이 필요하다.
- actor profile은 입력한 `ProfileFollow.followee`와 같아야 하며 `ACTIVE` 상태여야 한다.
- 현재 세션 계정은 actor profile에 대해 `OWNER` 또는 `ADMIN` role을 가져야 한다.

효과:

- `ProfileFollow.state`를 응답 값으로 변경한다.
- `ProfileFollow.respondedAt`을 현재 시각으로 설정한다.

## Query 후보

MVP GraphQL API에는 다음 query를 우선 고려한다.

```graphql
type Profile implements Node {
  id: ID!
  handle: String!
  displayName: String!
  bio: String
  avatarUrl: String
  bannerUrl: String
  followPolicy: FollowPolicy!
  viewerRole: ProfileRole
  viewerFollowing: ProfileFollow
  viewerFollowedBy: ProfileFollow
  followers(first: Int, after: String): ProfileFollowConnection!
  following(first: Int, after: String): ProfileFollowConnection!
  posts(first: Int, after: String): PostConnection!
  createdAt: DateTime!
}

type Account {
  id: ID!
  profiles: [AccountProfile!]!
}

type AccountProfile {
  profile: Profile!
  role: ProfileRole!
}

type ProfileFollow implements Node {
  id: ID!
  follower: Profile!
  followee: Profile!
  state: ProfileFollowState!
  createdAt: DateTime!
  respondedAt: DateTime
}

type PageInfo {
  hasPreviousPage: Boolean!
  hasNextPage: Boolean!
  startCursor: String
  endCursor: String
}

type ProfileFollowConnection {
  edges: [ProfileFollowEdge!]!
  pageInfo: PageInfo!
}

type ProfileFollowEdge {
  node: ProfileFollow!
  cursor: String!
}

input ChangeProfileHandleInput {
  profileId: ID!
  handle: String!
}

input UnfollowProfileInput {
  followId: ID!
}

type Query {
  viewer: Account
  profile(id: ID!): Profile
  profileByHandle(handle: String!): Profile
}

type Mutation {
  changeProfileHandle(input: ChangeProfileHandleInput!): Profile!
  unfollowProfile(input: UnfollowProfileInput!): ProfileFollow!
}
```

`viewer.profiles`는 현재 계정이 관리할 수 있는 `ACTIVE` 프로필과 role을 함께 반환한다.

팔로워/팔로잉 목록은 Relay Connection 스타일을 기준으로 추가한다.
edge의 `node`는 팔로우 관계의 `state`, `createdAt`, `respondedAt`이 필요한 승인 대기/관리 화면까지 고려해 `ProfileFollow`를 반환한다.
`Profile.posts`는 이 프로필이 작성한 게시물 목록이며, `PostConnection`의 세부 필드와 게시물 공개 범위는 Post GraphQL 스펙에서 정의한다.

## 에러 처리

Mutation 실패는 GraphQL 표준 `errors` 배열로 응답하고, 클라이언트가 분기할 수 있도록 `extensions.code`를 포함한다.
메시지는 사용자 표시용 문구가 아니라 개발자 진단용으로 취급한다.

```json
{
  "errors": [
    {
      "message": "Profile not found.",
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ]
}
```

| 케이스                                                  | `extensions.code`         | 방침                                                                   |
| ------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| 존재하지 않는 `profileId` 또는 `followId`를 입력한 경우 | `NOT_FOUND`               | 대상 리소스를 찾을 수 없으면 mutation을 적용하지 않는다.               |
| `handle`이 이미 사용 중인 경우                          | `HANDLE_ALREADY_EXISTS`   | 정규화된 handle 기준으로 중복을 검사하고 변경/생성을 거절한다.         |
| 권한이 없는 계정이 mutation을 호출한 경우               | `FORBIDDEN`               | 인증은 되었지만 필요한 role이나 관계가 없으면 mutation을 거절한다.     |
| actor profile이 없는데 actor가 필요한 mutation인 경우   | `ACTOR_PROFILE_REQUIRED`  | `followProfile`, `unfollowProfile`처럼 actor가 필요한 동작은 실패한다. |
| 자기 자신을 팔로우하려는 경우                           | `SELF_FOLLOW_NOT_ALLOWED` | follower와 followee가 같으면 `ProfileFollow`를 만들지 않는다.          |

## 구현 메모

- `id`는 opaque Relay global ID로 노출한다. 클라이언트는 내부 식별자 포맷을 파싱하거나 저장 포맷에 의존하면 안 된다.
- `Profile` Node 조회는 ID가 프로필 오브젝트를 가리키는지 검증해야 한다.
- `Profile` 필드의 공개 조회 가능 여부는 필드 테이블의 `공개 조회` 컬럼을 기준으로 한다. `viewerRole`, `viewerFollowing`, `viewerFollowedBy`는 인증된 요청에서만 계산한다.
- 공개 `Profile`은 프로필 생명주기 상태를 직접 노출하지 않는다. 상태별 조회, 복구, 운영자 확인 정책은 별도 관리 스펙에서 정의한다.
- `handle`은 GraphQL 입력에서 소문자 정규화와 허용 문자 정책이 필요하다. 구체적인 regex는 federation handle 정책을 정한 뒤 확정한다.
- `handle` 변경은 MVP에서 `changeProfileHandle` mutation으로 제공한다. ActivityPub actor `id` URI는 handle과 분리해 안정적으로 유지한다.
- MVP GraphQL API에서는 handle 도메인을 필드나 인자로 노출하지 않는다. `profileByHandle(handle:)`은 로컬 서비스 handle namespace 기준으로 조회한다.
- 프로필 태그와 테마는 MVP 필수 기능이지만, 이 문서에서는 `Profile` 기본 오브젝트와 직접 연결되는 경계만 다룬다. API는 별도 스펙에서 정의한다.
- 아바타/배너는 MVP 프로필 화면에 필요하다. `avatarUrl`, `bannerUrl`은 API 표현 필드이며, 장기 저장 책임과 원본 파일 접근 정책은 별도 미디어 API가 맡는다.
- `createProfile`은 새 `Profile`과 요청 계정의 `AccountProfile(role: OWNER)`을 하나의 원자적 동작으로 보장해야 한다.
- 프로필 actor가 필요한 mutation은 요청 컨텍스트에 확정된 actor profile이 없으면 실패해야 한다.
- 역할 권한 검사는 서버가 계산한 membership을 기준으로 한다. 클라이언트가 보낸 role 정보는 신뢰하지 않는다.
- `ProfileFollow`는 방향성이 중요하므로 follower/followee 용어를 API에서 일관되게 쓴다.
- `viewerFollowing`은 현재 actor profile이 조회 대상 프로필을 팔로우하는 관계이고, `viewerFollowedBy`는 조회 대상 프로필이 현재 actor profile을 팔로우하는 관계다.
- `followers`와 `following`은 Relay Connection 스타일로 구현한다. cursor는 정렬 기준과 내부 ID를 드러내지 않는 opaque 값이어야 한다.
- `unfollowProfile`은 MVP에서 `ProfileFollow`를 삭제한다. 응답은 삭제 직전의 팔로우 관계를 반환할 수 있게 resolver에서 삭제 전 row를 확보한다.
- `respondProfileFollow`는 actor profile을 팔로우 응답의 주체로 사용한다. actor profile은 입력한 `ProfileFollow.followee`와 같아야 하며 `ACTIVE` 상태여야 한다.
- `Profile.posts`는 프로필이 작성한 게시물과의 관계만 이 문서에서 선언한다. `PostConnection`, 게시물 공개 범위, 정렬, 삭제/비활성화된 프로필 게시물 노출은 Post 스펙에서 정의한다.
- mutation 실패는 GraphQL `errors` 배열과 `extensions.code`를 사용해 구분한다. resolver는 부분 변경 없이 실패하도록 mutation 단위 트랜잭션을 사용한다.

## 열린 질문

- federation 도입 시 handle namespace와 원격 도메인 정책을 GraphQL API에 노출할지 별도 스펙에서 결정한다.
- `MEMBER`가 게시 권한을 가지는지, 읽기/전환만 가능한지 product policy가 필요하다.
- `REJECTED` 상태의 `ProfileFollow`를 재요청 때 재사용할지 새 관계로 만들지 결정해야 한다.
- `unfollowProfile`을 장기적으로 물리 삭제로 유지할지, 감사 로그나 federation 호환성을 위해 soft delete 또는 취소 상태를 둘지 결정해야 한다.
- 프로필 비활성화가 작성된 게시물의 노출에 어떤 영향을 주는지 별도 post visibility policy가 필요하다.
- `Profile.posts`의 정렬 기준, 공개 범위, 페이지네이션 cursor 정책은 Post GraphQL 스펙에서 결정한다.
- `avatarUrl`, `bannerUrl`을 클라이언트가 캐시해도 되는 공개 URL로 볼지, 만료 가능한 URL로 볼지 결정해야 한다.
