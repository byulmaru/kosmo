# GraphQL 코딩 스타일: Query And Error

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
