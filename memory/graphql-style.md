# GraphQL 코딩 스타일

## 목적

kosmo GraphQL resolver를 구현하거나 리뷰할 때 이 메모를 참고한다.
오브젝트 정의, query field, mutation, enum, Relay Node ID 처리를 API가 커져도 일관되게 유지하는 것이 목적이다.

## 기본 방향

- GraphQL 오브젝트는 `createObjectRef` 기반 loadable Node ref로 정의한다.
- GraphQL resolver가 이미 대상 row를 가지고 있으면 그 row를 반환해도 된다. 다만 Node 전체를 반환하기 위해 추가 query를 만들 필요는 없고, 그 경우에는 Node `id`만 반환해 loadable Node ref가 로딩하게 한다.
- GraphQL type name, DB table, Relay Node discriminator 연결은 `ref.ts`에서 한다.
- resolver 파일은 작게 유지하고, 각 디렉터리의 `index.ts`는 import 조립과 public export만 담당한다.

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

- `createObjectRef(name, table, TableDiscriminator.X)`를 사용한다.
- `createObjectRef`가 Relay Node type discriminator를 등록한다.
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

## Query

Query는 필드별로 분리한다.

- `query/index.ts`는 query field 파일 import만 나열한다.
- 각 query 파일은 자기 `builder.queryField` 항목만 정의한다.
- Node 타입을 반환하는 query는 이미 row를 조회했다면 row를 반환해도 된다. 단, 이미 ID를 알고 있는 상황에서 Node 전체를 만들기 위한 추가 조회는 피한다.
- 인증이 필요한 query는 `t.withAuth(...)`를 사용하고, null 반환이 기대되는 경우 `unauthorizedResolver`를 명시한다.

예시:

```ts
builder.queryField('me', (t) =>
  t.withAuth({ login: true }).field({
    type: Account,
    nullable: true,
    resolve: (_, __, ctx) => ctx.session.accountId,
    unauthorizedResolver: () => null,
  }),
);
```

## Mutation

Mutation도 필드별로 나눈다.

- input type은 해당 mutation 파일 가까이에 둔다.
- mutation resolver는 권한 확인, 입력 정규화, DB 변경을 수행한다.
- mutation이 Node 타입을 반환할 때 이미 `returning()` 등으로 row를 가지고 있으면 row를 반환해도 된다. 추가 조회가 필요하다면 `id`만 반환한다.
- 부분 변경 없이 실패해야 하는 mutation은 transaction을 사용한다.
- 클라이언트가 분기해야 하는 에러는 `GraphQLError`의 `extensions.code`를 사용한다.

## Enum

GraphQL enum은 `apps/api/src/graphql/enums.ts`에서 전역 등록한다.

- core enum 객체는 `builder.enumType`으로 구현된 뒤에만 GraphQL `type`으로 사용할 수 있다.
- 새 core enum을 resolver field에 노출하려면 먼저 `enums.ts`에 추가한다.
- enum 이름은 공개 GraphQL 타입 이름이다. `ProfileFollowPolicy`처럼 도메인 의미가 드러나는 이름을 선호한다.

## ID와 Node

- Relay Node ID는 DB UUID를 opaque global ID로 사용한다.
- `createObjectRef`는 table discriminator와 GraphQL type name을 `globalIdMap`에 등록한다.
- Node decode는 UUID discriminator로 GraphQL type name을 찾는다.
- 클라이언트는 ID 내부 구조에 의존하면 안 된다.

## DB 접근

- resolver 코드는 Drizzle query builder를 직접 사용한다.
- 단건 조회에는 필요하면 `first` 같은 helper를 사용한다.
- `createObjectRef`가 만든 loadable Node ref는 batched loading을 제공한다.
- query, mutation, relationship resolver는 불필요한 추가 조회를 피한다. 이미 row가 있으면 row를 반환하고, ID만 있으면 ID를 반환해 Node loader를 타게 한다.

## Nullability

- Pothos builder의 기본 nullability는 non-null이다.
- non-null 필드에는 `nullable: false`를 반복해서 쓰지 않는다.
- nullable 필드에만 `nullable: true`를 명시한다.
- viewer context나 인증 상태에 따라 없을 수 있는 필드는 nullable로 둔다.
- 조회 query에서 리소스를 찾지 못한 경우는 보통 null을 반환한다.
