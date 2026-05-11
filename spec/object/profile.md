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

다음 기능은 제품 MVP에 필요하지만, 프로필 기본 오브젝트 스펙에서는 별도 스펙 또는 후속 저장소 설계로 분리한다.

- 프로필 태그 직접 추가/삭제, 공개 표시, 태그 검색, 태그 뮤트
- 프로필별 테마 프리셋, 포인트 컬러, 레이아웃

다음 기능은 MVP 이후로 미룬다.

- 커스텀 필드
- ActivityPub Actor 세부 필드
- AT Protocol record/cache 연결
- 프로필 차단, 뮤트, 신고, moderation audit
- 프로필 삭제 복구 정책과 tombstone federation

## 데이터 모델

### `profile`

프로필의 durable identity를 저장한다.

| 필드            | 타입            | 필수   | 설명                                                                                |
| --------------- | --------------- | ------ | ----------------------------------------------------------------------------------- |
| `id`            | `uuid`          | 예     | 내부 PK. `TableDiscriminator.Profiles`로 생성한다.                                  |
| `state`         | `profile_state` | 예     | 프로필 생명주기 상태. 기본값은 `ACTIVE`.                                            |
| `handle`        | `text`          | 예     | 프로필의 고유 핸들. MVP에서는 전역 unique로 둔다.                                   |
| `display_name`  | `text`          | 예     | 화면에 표시할 이름.                                                                 |
| `bio`           | `text`          | 아니오 | 자기소개.                                                                           |
| `avatar_url`    | `text`          | 아니오 | 프로필 아바타 API 표현 필드. 미디어 저장 모델이 확정되기 전 MVP 임시 표현으로 둔다. |
| `banner_url`    | `text`          | 아니오 | 프로필 배너 API 표현 필드. 미디어 저장 모델이 확정되기 전 MVP 임시 표현으로 둔다.   |
| `follow_policy` | `follow_policy` | 예     | 팔로우 요청 처리 정책.                                                              |
| `created_at`    | `datetime`      | 예     | 생성 시각.                                                                          |
| `updated_at`    | `datetime`      | 예     | 마지막 수정 시각.                                                                   |

제약:

- `handle`은 unique여야 한다.
- `handle`은 PK로 사용하지 않지만, MVP에서는 WebFinger와 federation 주소의 안정성을 위해 불변 식별자로 취급한다.
- handle 변경은 redirect, alias, mention, federation actor 정책이 정해진 뒤 별도 mutation으로 추가한다.
- `state = ACTIVE`인 프로필만 일반 조회, 게시, 팔로우의 대상이 된다.

### `account_profile`

계정과 프로필의 관리 관계를 저장한다.

| 필드         | 타입                   | 필수 | 설명                                                      |
| ------------ | ---------------------- | ---- | --------------------------------------------------------- |
| `id`         | `uuid`                 | 예   | 내부 PK. `TableDiscriminator.AccountProfiles`로 생성한다. |
| `account_id` | `uuid`                 | 예   | 연결된 계정.                                              |
| `profile_id` | `uuid`                 | 예   | 연결된 프로필.                                            |
| `role`       | `account_profile_role` | 예   | 계정이 프로필에 대해 가지는 역할.                         |
| `created_at` | `datetime`             | 예   | 관계 생성 시각.                                           |

제약:

- `(account_id, profile_id)`는 unique여야 한다.
- `account_id`, `profile_id` 기준 조회를 위해 각각 index를 둔다.
- MVP에서는 프로필 생성자가 `OWNER` 역할을 가진 `account_profile` row를 함께 만든다.

역할:

| 값       | 의미                                                                       |
| -------- | -------------------------------------------------------------------------- |
| `OWNER`  | 프로필의 최상위 관리자. 프로필 삭제/비활성화, 역할 관리 권한을 가진다.     |
| `ADMIN`  | 프로필 운영자. 프로필 정보 수정과 게시 권한을 가진다.                      |
| `MEMBER` | 제한된 멤버. 게시 또는 프로필 선택 권한을 가질 수 있으나 관리 권한은 없다. |

### `profile_follow`

프로필 간 팔로우 관계를 저장한다.

| 필드                  | 타입           | 필수   | 설명                                                     |
| --------------------- | -------------- | ------ | -------------------------------------------------------- |
| `id`                  | `uuid`         | 예     | 내부 PK. `TableDiscriminator.ProfileFollows`로 생성한다. |
| `follower_profile_id` | `uuid`         | 예     | 팔로우를 거는 프로필.                                    |
| `followee_profile_id` | `uuid`         | 예     | 팔로우 대상 프로필.                                      |
| `state`               | `follow_state` | 예     | 팔로우 요청 상태.                                        |
| `created_at`          | `datetime`     | 예     | 요청 생성 시각.                                          |
| `responded_at`        | `datetime`     | 아니오 | 승인 또는 거절 시각.                                     |

제약:

- `(follower_profile_id, followee_profile_id)`는 unique여야 한다.
- 자기 자신을 팔로우할 수 없다.
- 팔로워 목록 조회는 `(followee_profile_id, state)` index를 사용한다.
- 팔로잉 목록 조회는 `(follower_profile_id, state)` index를 사용한다.

상태:

| 값         | 의미                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| `PENDING`  | 승인 대기 중. 대상 프로필의 `follow_policy = APPROVAL_REQUIRED`일 때 생성된다. |
| `ACCEPTED` | 팔로우 성립. 대상 프로필의 `follow_policy = OPEN`이면 즉시 이 상태가 된다.     |
| `REJECTED` | 팔로우 거절. 동일 pair 재요청 정책은 별도 product decision으로 둔다.           |

## 조회 권한

### 공개 조회

인증 없이도 `ACTIVE` 프로필의 다음 필드를 조회할 수 있다.

- `id`
- `handle`
- `displayName`
- `bio`
- `avatarUrl`
- `bannerUrl`
- `followPolicy`
- `createdAt`

프로필 태그와 테마는 제품 MVP의 핵심 기능이지만, 공개 조회 필드와 저장 모델은 별도 스펙에서 정의한다.
federation actor URL은 ActivityPub 구현 시점에 공개 여부를 별도 결정한다.

### 인증 조회

인증된 계정은 자신이 연결된 프로필에 대해 다음 정보를 추가로 조회할 수 있다.

- `account_profile.role`
- 현재 세션의 active profile 여부
- 자신과 해당 프로필의 팔로우 관계 상태

다른 계정의 `account_profile` 목록은 기본적으로 공개하지 않는다.

## 요청 컨텍스트

API 요청의 actor profile은 다음 순서로 결정한다.

1. `Authorization: Bearer <token>`으로 active session을 찾는다.
2. `X-Actor-Profile-Id` 헤더가 있으면 해당 프로필을 actor 후보로 사용한다.
3. 헤더가 없으면 `session.active_profile_id`를 actor 후보로 사용한다.
4. 후보 프로필이 현재 계정과 `account_profile`로 연결되어 있고 `state = ACTIVE`일 때만 actor로 확정한다.
5. 조건을 만족하지 않으면 actor profile은 `null`이다.

프로필을 actor로 요구하는 mutation은 `ctx.session.profileId`가 없으면 실패해야 한다.

## Mutation 권한

### `createProfile`

새 프로필을 만들고 요청 계정을 `OWNER`로 연결한다.

필수 입력:

- `handle`
- `displayName`
- `followPolicy`

선택 입력:

- `bio`
- `avatarUrl`
- `bannerUrl`

권한:

- 인증된 계정만 호출할 수 있다.

검증:

- `handle`은 unique여야 한다.
- `displayName`은 빈 문자열이면 안 된다.
- `bio`는 빈 문자열을 `null`로 정규화할 수 있다.
- `avatarUrl`, `bannerUrl`은 API 입력/출력 표현 필드다. 미디어 업로드 모델이 들어오기 전까지는 임시 URL만 받는다.
- 원본 Object Storage URL을 그대로 저장하거나 노출하지 않는다.

효과:

- `profile` row를 생성한다.
- 같은 transaction에서 `account_profile` row를 `OWNER` role로 생성한다.

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

MVP에서는 `handle` 변경을 지원하지 않는다. handle 변경은 외부 federation, mention, redirect 정책이 정해진 뒤 별도 mutation으로 추가한다.

### `disableProfile`

프로필을 비활성화한다.

권한:

- 해당 프로필의 `OWNER`만 호출할 수 있다.

효과:

- `profile.state`를 `DISABLED`로 변경한다.
- 비활성화된 프로필은 새 게시물 작성, 팔로우 요청, 공개 조회 대상에서 제외된다.

MVP에서는 물리 삭제하지 않는다. `profile`에 `deleted_at`이 없으므로 복구 가능한 삭제와 federation tombstone은 후속 설계로 남긴다.

### `setActiveProfile`

세션의 기본 actor profile을 바꾼다.

입력:

- `profileId`

권한:

- 인증된 계정이 해당 프로필과 `account_profile`로 연결되어 있어야 한다.
- 해당 프로필은 `ACTIVE`여야 한다.

효과:

- 현재 `session.active_profile_id`를 입력 프로필로 변경한다.

### `followProfile`

현재 actor profile이 대상 프로필을 팔로우한다.

입력:

- `profileId`: 팔로우 대상 프로필

권한:

- actor profile이 필요하다.
- actor profile과 대상 profile 모두 `ACTIVE`여야 한다.

검증:

- 자기 자신을 팔로우할 수 없다.
- 이미 같은 follower/followee pair가 있으면 기존 row의 상태를 기준으로 응답한다.

효과:

- 대상 프로필의 `followPolicy = OPEN`이면 `state = ACCEPTED` row를 만든다.
- 대상 프로필의 `followPolicy = APPROVAL_REQUIRED`이면 `state = PENDING` row를 만든다.

### `respondProfileFollow`

팔로우 요청을 승인하거나 거절한다.

입력:

- `followId`
- `response`: `ACCEPTED` 또는 `REJECTED`

권한:

- 인증된 계정이 필요하다.
- 현재 세션 계정은 `followee_profile_id` 프로필에 대해 `OWNER` 또는 `ADMIN` role을 가져야 한다.
- 현재 세션의 actor profile이 있으면 `ACTIVE` 상태여야 한다.

효과:

- `profile_follow.state`를 응답 값으로 변경한다.
- `responded_at`을 현재 시각으로 설정한다.

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
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Query {
  profile(id: ID!): Profile
  profileByHandle(handle: String!): Profile
  viewerProfiles: [Profile!]!
}
```

`viewerProfiles`는 현재 계정이 `account_profile`로 연결된 `ACTIVE` 프로필 목록을 반환한다.

팔로워/팔로잉 connection은 pagination 정책을 정한 뒤 추가한다.

## 구현 메모

- DB 내부 ID는 PostgreSQL `uuid`로 유지하고, GraphQL `ID`는 opaque Relay global ID로 감싼다.
- Profile Node resolver는 UUID의 table discriminator가 `Profiles`인지 검증한다.
- `handle`은 API 입력에서 소문자 정규화와 허용 문자 정책이 필요하다. 구체적인 regex는 federation handle 정책을 정한 뒤 확정한다.
- `handle`은 MVP에서 불변으로 취급한다. 변경 기능은 Move Activity, alias, WebFinger redirect 정책과 함께 설계한다.
- 프로필 태그와 테마는 MVP 필수 기능이지만, 이 문서에서는 `profile` 기본 오브젝트와 직접 연결되는 경계만 다룬다. 저장소와 API는 별도 스펙에서 정의한다.
- 아바타/배너는 MVP 프로필 화면에 필요하다. `avatarUrl`, `bannerUrl`은 API 표현 필드이며, 장기 저장 모델은 `media_asset`, `media_variant`, `profile_media` 같은 명시적 테이블로 분리한다.
- CDN 공개 URL, Object Storage key, 원본 파일 접근 정책은 서로 다른 책임으로 다룬다.
- 프로필 생성과 `account_profile` 생성은 반드시 한 transaction에서 처리한다.
- 프로필 actor가 필요한 mutation은 `ctx.session.profileId`를 공통 guard로 검사한다.
- 역할 권한 검사는 `account_profile`을 기준으로 한다. 클라이언트가 보낸 role 정보는 신뢰하지 않는다.
- `profile_follow`는 방향성이 중요하므로 follower/followee 용어를 API와 DB에서 일관되게 쓴다.

## 열린 질문

- handle namespace를 MVP에서 전역으로 둘지, 추후 instance/domain을 포함한 compound key로 바꿀지 결정해야 한다.
- `MEMBER`가 게시 권한을 가지는지, 읽기/전환만 가능한지 product policy가 필요하다.
- `REJECTED` follow row를 재요청 때 재사용할지 새 row를 만들지 결정해야 한다.
- 프로필 비활성화가 작성된 게시물의 노출에 어떤 영향을 주는지 별도 post visibility policy가 필요하다.
- MVP의 `avatarUrl`, `bannerUrl` API 표현을 장기 미디어 모델과 어떻게 매핑할지 결정해야 한다.
