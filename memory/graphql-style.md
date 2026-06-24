# GraphQL 코딩 스타일

## 목적

kosmo GraphQL resolver를 구현하거나 리뷰할 때 이 메모를 참고한다.
오브젝트 정의, query field, mutation, enum, Relay Node ID 처리를 API가 커져도 일관되게 유지하는 것이 목적이다.

## 기본 방향

- GraphQL 오브젝트는 `createObjectRef` 기반 loadable Node ref로 정의한다.
- GraphQL resolver가 이미 대상 row를 가지고 있으면 그 row를 반환해도 된다. 다만 Node 전체를 반환하기 위해 추가 query를 만들 필요는 없고, 그 경우에는 Node `id`만 반환해 loadable Node ref가 로딩하게 한다.
- GraphQL type name, DB table, Relay Node discriminator 연결은 `ref.ts`에서 한다.
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
- viewer 기준 관계는 단순 state scalar보다 관계 Node를 반환하는 쪽을 우선 검토한다. 관계 row의 `id`, timestamp, 후속 metadata가 클라이언트 cache 갱신과 UI 확장에 필요할 수 있기 때문이다.

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

- mutation은 기본적으로 `t.withAuth(...).fieldWithInput(...)`로 정의한다.
- 단순 scalar 검증은 `input` 필드에 `validate`를 직접 붙인다.
- 여러 필드 조합을 검증해야 하는 경우에만 mutation 파일 안에 inline Zod object schema를 둔다.
- `packages/core/validation`에는 `handle`, `displayName`, `bio` 같은 재사용 가능한 공통 primitive schema만 둔다. `createProfileInputSchema`처럼 특정 GraphQL mutation input 전체를 core에 공통화하지 않는다.
- mutation resolver는 권한 확인, 입력 정규화, DB 변경을 수행한다.
- create mutation처럼 입력을 최소화할 수 있으면 필수 입력만 받고, 나머지 값은 resolver에서 명확한 기본값으로 채운다. 예를 들어 profile 생성은 `handle`만 받고 `displayName`은 `handle`, `followPolicy`는 `OPEN`으로 설정한다.
- update mutation input은 omitted과 `null`의 의미를 명확히 분리한다. 생략은 보통 변경 없음이고, nullable 도메인 필드의 `null`은 명시적 clear가 될 수 있다. non-null 도메인 필드는 update input에서 optional로 받더라도 `null`을 새 값으로 보지 않는다.
- mutation이 Node 타입을 반환할 때 이미 `returning()` 등으로 row를 가지고 있으면 row를 반환해도 된다. 추가 조회가 필요하다면 `id`만 반환한다.
- delete/disable처럼 반환할 Node가 더 이상 현재 GraphQL 타입의 auth scope를 만족하지 않을 수 있으면 Node 자체를 반환하지 말고 삭제/비활성화된 대상의 `ID` 같은 payload 값을 반환한다.
- 삭제/해제 mutation payload의 ID는 클라이언트가 cache에서 제거해야 하는 실제 관계/대상 row의 ID여야 한다. 예를 들어 follow 관계를 삭제하면 `Profile.id`가 아니라 삭제된 `ProfileFollow.id`를 반환한다.
- 상태가 있는 관계 mutation은 기존 row를 특정 state로 필터링해서 찾지 말고, 먼저 관계 row를 조회한 뒤 state별 정책으로 분기한다.
- 부분 변경 없이 실패해야 하는 mutation은 transaction을 사용한다.
- mutation 성공 결과는 Pothos Simple Objects plugin으로 정의한 `<MutationName>Payload` object를 반환한다. 예를 들어 `createProfile`은 `CreateProfilePayload`를 반환한다.
- mutation payload object는 재사용되지 않으면 별도 `payload.ts`로 빼지 않고, 해당 mutation 파일 안에 inline으로 정의한다.
- payload field 이름은 `profile`, `profileId`처럼 클라이언트가 받는 성공 payload의 도메인 의미가 드러나는 이름으로 지정한다.
- domain error는 result union으로 반환하지 않고 GraphQL `errors[]` 경로로 전달한다.
- Zod/Pothos validation 실패는 builder의 `validation.validationError`가 `ValidationError`로 변환한다.
- 인증 scope 부족은 resolver에서 직접 던지지 않고 `t.withAuth({ login: true })` 같은 auth 설정으로 처리한다.
- scope-auth 기본 unauthorized error는 사용하지 않고 builder의 `scopeAuth.unauthorizedError`에서 `PermissionDeniedError`로 변환한다.
- resolver 안에서는 대상 리소스에 대한 권한 부족만 `PermissionDeniedError`로 던진다.
- 의도적으로 후속 정책으로 미룬 state나 분기는 `TODO:` 주석으로 남겨 검색 가능하게 한다.

예시:

```ts
builder.mutationField('createProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('CreateProfilePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
      }),
    }),
    input: {
      handle: t.input.string({ validate: profileHandleSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      const profile = await createProfile(input, ctx);
      return { profile };
    },
  }),
);
```

## Error

GraphQL로 노출되는 도메인 에러는 `packages/core/error`에 GraphQL 독립 class로 정의하고, Yoga error plugin에서 GraphQL `errors[]`로 변환한다.

- 기본 error 계층은 `KosmoError`, `FieldError`, `ValidationError`, `ConflictError`, `NotFoundError`, abstract `ForbiddenError`, `PermissionDeniedError`를 사용한다.
- `ForbiddenError`는 직접 throw하지 않는 abstract/base class다.
- `FieldError.field`는 optional이다. 특정 input field에 귀속되는 validation/conflict일 때만 채운다.
- validation plugin에서 발생한 입력 검증 오류는 builder 설정에서 첫 issue의 message와 `input`을 제거한 path를 사용해 `ValidationError`로 변환한다.
- `KosmoError.message`는 GraphQL error `message`로 노출한다.
- `KosmoError.code`는 GraphQL error `extensions.code`로 노출한다.
- `FieldError.field`가 있으면 GraphQL error `extensions.field`로 노출한다.
- auth scope 실패는 builder의 `scopeAuth.unauthorizedError`가 `PermissionDeniedError`로 변환해 GraphQL error `extensions.code`를 `PERMISSION_DENIED`로 노출한다.
- 예상 밖 오류는 프로덕션에서 `Unexpected error`와 `INTERNAL_SERVER_ERROR` code로 마스킹한다.

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
- 단건 조회에는 `first`, `firstOrThrow`, `firstOrThrowWith` 같은 helper를 사용한다.
- 결과 row가 반드시 있어야 하고 없으면 DB/서버 불일치로 보는 5xx 성격의 오류라면 `firstOrThrow`를 사용한다. 예를 들어 insert/update 후 `returning()`이 비는 경우가 이에 해당한다.
- 결과 row가 없을 수 있고 그 원인이 클라이언트 입력, 권한, 대상 부재 같은 4xx 성격의 도메인 오류라면 `firstOrThrowWith`로 `NotFoundError` 등 명시적 도메인 에러를 던진다.
- 존재 확인과 actor 권한 조회는 가능하면 join으로 한 번에 처리한다. 예를 들어 profile mutation은 `Profiles`와 `AccountProfiles`를 join해 active profile 존재 여부와 actor role을 같이 조회한 뒤 role을 검사한다.
- PostgreSQL unique violation 판정은 resolver 로컬 함수로 만들지 않고 `@kosmo/core/db`의 `isUniqueViolation` helper를 사용한다.
- `createObjectRef`가 만든 loadable Node ref는 batched loading을 제공한다.
- query, mutation, relationship resolver는 불필요한 추가 조회를 피한다. 이미 row가 있으면 row를 반환하고, ID만 있으면 ID를 반환해 Node loader를 타게 한다.
- kosmo 자체 구현 UUID v8 ID가 시간순 정렬 의미를 이미 제공하는 경우 connection cursor/order에서 `createdAt` 정렬을 중복으로 붙이지 않는다. 별도 product 의미가 있을 때만 `createdAt`을 정렬 기준으로 쓴다.

## Nullability

- Pothos builder의 기본 nullability는 non-null이다.
- non-null 필드에는 `nullable: false`를 반복해서 쓰지 않는다.
- nullable 필드에만 `nullable: true`를 명시한다.
- viewer context나 인증 상태에 따라 없을 수 있는 필드는 nullable로 둔다.
- 조회 query에서 리소스를 찾지 못한 경우는 보통 null을 반환한다.

## Client And Spec Sync

- GraphQL operation은 실제 사용하는 Svelte 파일에 colocate한다. 프론트 세부 규칙은 `memory/frontend-svelte.md`를 따른다.
- GraphQL mutation error UI 분기가 여러 컴포넌트에서 반복되면 공통 helper나 error handling boundary로 모을 후보로 본다.
- API 구현과 OpenSpec은 root field, object field, payload, error type, connection 단위가 서로 맞아야 한다.
- GraphQL field/payload shape가 바뀌면 같은 변경에서 OpenSpec도 정렬한다.
