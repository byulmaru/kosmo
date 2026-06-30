# Frontend Svelte Memory

## Purpose

- `apps/web` Svelte, Mearie GraphQL, Storybook 컴포넌트를 구현하거나 리뷰할 때 이 메모를 적용한다.
- 특히 GraphQL data component, fragment colocation, Storybook mock, UI 상태/에러 표시 정책을 일관되게 유지한다.

## GraphQL Colocation

- GraphQL query, mutation, fragment document는 실제로 사용하는 `.svelte` 파일에 둔다.
- 여러 컴포넌트가 같은 데이터 일부를 필요로 하면 document 자체를 재사용하지 말고 각 컴포넌트 fragment와 fragment spread로 나눈다.
- 별도 `.ts` 파일로 빼는 것은 runtime boundary나 generated integration처럼 Svelte component 밖에 document를 둘 명확한 이유가 있을 때만 한다.
- document를 사용하는 파일과 타입이 떨어지면 수동 타입 정의가 늘어나므로 피한다.
- route/page query는 해당 route component에 두고, 자식 컴포넌트에는 fragment spread와 fragment ref로 데이터를 넘긴다.

## Fragment Components

- `apps/web`에서 GraphQL entity 데이터를 받는 Svelte 컴포넌트는 기본적으로 fragment component로 작성한다. `handle`, `displayName` 같은 field subset을 개별 scalar prop으로 복제하는 것은 fragment 경계를 피할 명확한 이유가 있을 때만 허용한다.
- GraphQL 데이터를 소비하는 컴포넌트는 개별 scalar props를 나열하지 말고 Mearie가 생성한 `{FragmentName}$key` 타입을 받는다.
- `@mearie/svelte`의 `FragmentRefs<'FragmentName'>` helper를 fragment prop 타입으로 쓰지 않는다. Mearie 공식 fragment guide의 `$key` prop 타입 패턴을 따른다.
- generated fragment `$key` 타입은 `$mearie`에서 type-only import한다.
- 컴포넌트 내부에서 `$mearie`의 `graphql(...)`와 `createFragment(..., () => props.<name>)`를 사용한다.
- fragment typing을 피하려고 container/view를 나누지 않는다. 실제 책임 분리가 없다면 수동 타입 선언만 늘고 fragment의 장점이 사라진다.
- 컴포넌트가 필요한 데이터는 자신이 fragment로 선언한다.
- 부모는 자식 fragment를 spread해서 넘기고, 자식의 필드 목록을 부모 props 타입으로 복제하지 않는다.
- 자식 fragment 컴포넌트에 넘기는 값은 부모의 `$key`가 아니라 부모 `createFragment(...).data`(route query면 query의 `.data`)다. `$key`는 자기 fragment ref만 노출하므로 자식 `$key` prop에 직접 대입하면 타입 에러가 난다.

## Mearie Cache And Mutations

- `cacheExchange`의 `fetchPolicy`는 client(`apps/web/src/lib/graphql/client.ts`) 생성 시 한 번 고정되는 전역 상수이고, 이 repo는 `cache-and-network`를 사용한다(쿼리 실행 시 캐시를 즉시 내보내고 백그라운드 네트워크 재요청으로 갱신, PROD-110 리뷰 결정). mearie 문서에는 per-operation fetch policy(`useQuery` 세 번째 인자)가 있으나 0.6.7 기준 미구현이다 — 문서-구현 불일치이므로 per-query override를 시도하지 않는다.
- `cache-and-network`에서도 캐시 갱신은 쿼리가 새로 실행될 때(마운트, 변수 변경, `refetch()`) 일어난다. 화면이 떠 있는 동안 다른 곳에서 일어난 변경이 저절로 반영되지는 않으므로, mutation 이후 UI 갱신을 부모 `refetch()`에 의존하지 말고 아래 응답 기반 정규화 갱신을 우선한다.
- mutation 후 화면을 갱신하려면 응답에 **영향받는 엔티티의 `id`와 변경된 필드를 실어와** 정규화 캐시가 자동 갱신되게 한다. 예: follow/unfollow는 대상 `Profile`의 `viewerFollow`와 `followersCount`를 응답에서 선택한다.
- delete/해제 mutation은 삭제된 관계 row의 `id`만으로 부모 링크를 끊지 못한다. `Profile.viewerFollow`를 `null`로 만들려면 payload에 영향받는 부모 엔티티(예: `UnfollowProfilePayload.profile`)를 노출하고 클라이언트가 그 필드를 다시 선택해야 한다.
- 정규화로 안 되는 경우의 escape hatch로 `client.extension('cache').invalidate(...)`가 있으나(대상을 stale 처리해 네트워크 refetch 유발), 가능하면 응답 기반 정규화 갱신을 우선한다.
- GraphQL 스키마 필드를 추가/변경하면 API(`schema.graphql` 재생성)와 web(`mearie/vite` 타입 재생성) 양쪽 dev를 재시작해 정렬해야 한다. 안 맞으면 클라이언트가 서버가 모르는 필드를 보내 `mutation` 실패가 난다.

## Svelte Props And Reactivity

- `href` 유무에 따라 `<a>`와 `<div>`처럼 렌더링 element가 바뀌면 discriminated union props로 나눈다.
- element별 attributes는 `HTMLAnchorAttributes`, `HTMLAttributes<HTMLDivElement>`처럼 실제 element 타입에 맞춘다.
- `$derived`는 fragment data, query state, local state처럼 실제 reactive dependency가 있는 값에만 사용한다.
- 단순히 `props.foo`를 다시 감싸는 alias에는 `$derived`를 쓰지 않는다.
- 도달 불가능한 UI branch는 정리하거나, 후속 backend 정책을 위한 선제 구현이라면 주석/후속 이슈로 남긴다.

## Storybook

- fragment component story는 repo의 Storybook Mearie mock 경로를 따른다.
  - `$mearie` alias: `apps/web/.storybook/mocks/mearie.ts`
  - `@mearie/svelte` mock: `apps/web/.storybook/mocks/mearie-svelte.ts`
- raw object를 fragment ref로 캐스팅하는 helper는 mock이 해당 shape를 명시적으로 지원할 때만 사용한다.
- Storybook에서만 통과하고 실제 Mearie runtime에서는 깨질 수 있는 shape를 만들지 않는다.
- 컴포넌트 상태 story는 실제 variant/route/state 전체를 보여주어야 한다. 일부 active state만 노출하면 카탈로그 용도가 떨어진다.

## Tailwind Variants

- variant·slot 클래스 분기가 필요한 컴포넌트는 template string 조합 대신 `tailwind-variants`를 사용한다.
- `tv`는 `tailwind-variants`에서 직접 import하지 않고 `$lib/tv`의 공용 wrapper를 import한다. tailwind-merge가 layout.css `@theme` 커스텀 토큰(`text-text-secondary` 색상 vs `text-xsm` 폰트 크기)을 같은 그룹으로 오판해 색상 클래스를 제거하므로, wrapper가 토큰을 `twMergeConfig`에 등록해 둔다.
- `@theme`에 색상·폰트 크기 토큰을 추가하면 `$lib/tv.ts`의 등록 목록도 같은 변경에서 갱신한다.
- tv를 쓰는 컴포넌트의 `class` prop은 Svelte `ClassValue` 대신 `string | null`로 좁힌다(tailwind-merge가 숫자·딕셔너리를 받지 못함).

## Design Tokens

- 색상, 폰트 크기, radius 같은 디자인 값은 Tailwind 임의값(`text-[17px]`, `bg-[#fce79a]` 등)으로 하드코딩하지 않고, `apps/web/src/routes/layout.css`의 `@theme`에 정의된 Foundation 토큰 유틸리티(`text-md`, `text-text-primary`, `rounded-md` 등)를 사용한다.
- 필요한 토큰이 `@theme`에 없으면(예: font weight) 임의값으로 우회 구현하지 말고, 토큰 추가 여부·이름·값을 사용자에게 질문해 결정한 뒤 진행한다.
- 코드 `@theme` 토큰은 Figma Foundation 컬렉션과 이름·값을 일치시키고, 어느 한쪽에만 존재하는 토큰이 생기면 같은 작업에서 정렬하거나 후속 이슈로 남긴다.

## UI And Copy

- backend error `message`를 사용자 UI에 그대로 노출할지, error type/code로 분기할지, generic 한국어 fallback을 쓸지는 아직 확정된 정책이 아니다.
- 리뷰에서는 `message` 노출 자체를 곧바로 위반으로 단정하지 말고, 해당 흐름의 사용자 문구 정책이 정해져 있는지 먼저 확인한다. 정책이 정해진 뒤에는 컴포넌트마다 ad hoc 처리하지 말고 공통 error handling boundary나 helper로 모은다.
- 프로필 handle 표시 정책은 컴포넌트마다 ad hoc 처리하지 않는다. GraphQL에서는 표시용 문자열로 `Profile.relativeHandle`을 사용하고, `Profile.handle`은 URL lookup, local handle validation, route 생성용 bare handle로 둔다.
- Lucide 아이콘을 import할 때는 반드시 `GlobeIcon`, `ExampleIcon`처럼 `Icon` suffix가 붙은 이름만 사용한다.
- Figma/OpenSpec의 수치와 Tailwind class 수치가 다르면 코드 또는 spec을 같은 PR에서 정렬한다.
- 긴 표시 이름, 긴 handle, 비어 있는 값 등 layout edge case를 story에 포함한다.
