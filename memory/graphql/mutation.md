# GraphQL 코딩 스타일: Mutation

## Mutation

Mutation도 필드별로 나눈다.

- mutation은 기본적으로 `t.withAuth(...).fieldWithInput(...)`로 정의한다.
- 단순 scalar 검증은 `input` 필드에 `validate`를 직접 붙인다.
- 여러 필드 조합을 검증해야 하는 경우에만 mutation 파일 안에 inline Zod object schema를 둔다.
- `packages/core/validation`에는 `handle`, `displayName`, `bio` 같은 재사용 가능한 공통 primitive schema만 둔다. `createProfileInputSchema`처럼 특정 GraphQL mutation input 전체를 core에 공통화하지 않는다.
- mutation resolver는 권한 확인과 입력 정규화를 수행한다. 여러 진입점이 공유할 수 있는 state-changing
  action은 core service를 호출하고, GraphQL 진입점에서만 의미가 있는 state change는 resolver의
  query/persistence 계층에서 수행할 수 있다.
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
- `login`과 `profileRole` resolver는 production context가 이미 검증한 Active Account, selected Profile
  membership·role과 조회 가능 상태를 별도 actor query로 반복 검증하지 않는다. `profileRole`은
  `session.profile: { id, role } | null`에서 현재 selected Profile의 role을 검사하며,
  `AccountProfileRole.MEMBER`처럼 필요한 최소 role을 선언하고 Owner도 통과시키며, canonical action이
  추가 조건을 명시할 때만 그 조건을 조회한다. `Media.Source=Local`처럼 생성 결과의 source가 Local이라는
  사실만으로 selected Profile의 Instance 종류를 Local로 제한하지 않는다.
- resolver에서 환경 변수 묶음을 별도 Zod object로 다시 파싱하지 않는다. 중앙 env 모듈이 없는 현재
  runtime에서는 필요한 값을 직접 읽고 필수값 부재만 진입점에서 실패시키며, URL처럼 실제 사용 시 생성자가
  검증하는 값은 중복 schema를 두지 않는다.
- scope-auth 기본 unauthorized error는 사용하지 않고 builder의 `scopeAuth.unauthorizedError`에서 `PermissionDeniedError`로 변환한다.
- resolver 안에서는 대상 리소스에 대한 권한 부족만 `PermissionDeniedError`로 던진다.
- 의도적으로 후속 정책으로 미룬 state나 분기는 `TODO:` 주석으로 남겨 검색 가능하게 한다.

예시:

```ts
import { localProfileHandleSchema } from '@kosmo/core/validation';

builder.mutationField('createProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: builder.simpleObject('CreateProfilePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
      }),
    }),
    input: {
      handle: t.input.string({ validate: localProfileHandleSchema }),
    },
    resolve: async (_, { input }, ctx) => {
      const profile = await createProfile(input, ctx);
      return { profile };
    },
  }),
);
```
