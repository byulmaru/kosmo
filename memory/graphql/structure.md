# GraphQL 코딩 스타일: 구조

## 목적

kosmo GraphQL resolver를 구현하거나 리뷰할 때 이 메모를 참고한다.
오브젝트 정의, query field, mutation, enum, Relay Node ID 처리를 API가 커져도 일관되게 유지하는 것이 목적이다.

## 기본 방향

- GraphQL 오브젝트는 `createObjectRef` 기반 loadable Node ref로 정의한다.
- GraphQL resolver가 이미 대상 row를 가지고 있으면 그 row를 반환해도 된다. 다만 Node 전체를 반환하기 위해 추가 query를 만들 필요는 없고, 그 경우에는 Node `id`만 반환해 loadable Node ref가 로딩하게 한다.
- GraphQL type name과 DB table loader 연결은 `ref.ts`에서 한다.
- resolver 파일은 작게 유지하고, 각 디렉터리의 `index.ts`는 import 조립과 public export만 담당한다.
- GraphQL schema shape는 normalized cache와 도메인 소유 관계를 기준으로 정한다.
- top-level query보다 object field가 캐시 갱신에 더 적합하면 object field를 우선한다. 예를 들어 계정이 소유한 profile 목록은 `Account.profiles`로 둔다.
- DB column이 있다고 API field로 자동 노출하지 않는다. 실제 UI/API 사용 사례가 있고 접근 정책이 분명한 필드만 노출한다.

## 디렉터리 구조

resolver는 GraphQL 오브젝트 단위가 아니라 기능 모듈 단위로 묶는다.
예를 들어 `Profile`, `AccountProfile`, `ProfileFollow`는 모두 프로필 기능에 속하므로 `resolvers/profile/` 아래에 둔다.
기본 구조는 다음과 같다.

```txt
resolvers/<module>/
  index.ts
  ref.ts
  query/
    index.ts
    <field-name>.ts
  mutation/
    index.ts
    <field-name>.ts
  field/
    index.ts
    <field-name>.ts
```

모듈 안에 여러 오브젝트나 하위 책임이 있어 파일 수가 늘어나는 경우에는 선택적으로 폴더를 한 단계 더 둘 수 있다.
예를 들어 프로필 모듈 안에서 팔로우 관련 필드가 많아지면 `field/follow/<field-name>.ts`처럼 나눌 수 있다.
다만 반드시 하위 폴더를 만들어야 하는 것은 아니며, 파일 수와 책임 경계가 단순하면 `field/<field-name>.ts`를 유지한다.

## `ref.ts`

`ref.ts`는 GraphQL object ref와 기본 필드만 정의한다.

- `createObjectRef(name, load)`를 사용한다.
- `createObjectRef`는 concrete GraphQL typename의 loadable Node ref를 등록한다.
- `implement` 안에는 다른 GraphQL 오브젝트를 참조하지 않는 필드만 둔다.
- 다른 Node를 참조하는 필드, viewer 의존 필드, connection 필드는 `field/` 아래로 분리한다.
- `authScopes`는 해당 오브젝트의 기본 조회 가능성만 표현한다.

## 필드 확장

`ref.ts`에서 순환 참조를 만들지 않기 위해 관계 필드는 `builder.objectField` 또는 `builder.objectFields`로 확장한다.

- `Profile.viewerRole`, `Profile.viewerFollowing`, `Profile.followers` 같은 필드는 프로필 모듈 책임이므로 `profile/field/profile.ts` 또는 `profile/field/profile/*.ts`에 둔다.
- `Account.profiles`는 `Account` 타입의 필드이지만 프로필 관리 관계를 노출하는 프로필 모듈 책임이므로 `profile/field/account.ts`에 둔다.
- 필드 파일 위치는 GraphQL 필드를 소유한 타입이 아니라 도메인 책임 모듈을 기준으로 정한다.
- 관계 필드 resolver가 이미 대상 row를 조회했다면 row를 반환해도 된다.
- 대상 row가 없고 foreign key ID만 있는 경우에는 Node 전체를 얻기 위한 추가 query를 하지 말고 ID를 반환한다.
- connection edge의 `node`도 같은 기준을 적용한다. 이미 row가 있으면 row를, ID만 있으면 ID를 반환한다.
- viewer 기준 관계는 단순 state scalar보다 관계 Node를 반환하는 쪽을 우선 검토한다. 관계 row의 `id`, timestamp, 후속 metadata가 클라이언트 cache 갱신과 UI 확장에 필요할 수 있기 때문이다.
