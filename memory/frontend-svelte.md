# Frontend Svelte Memory

## Purpose

- `apps/web` Svelte, Mearie GraphQL, Storybook 컴포넌트를 구현하거나 리뷰할 때 이 메모를 적용한다.
- 특히 GraphQL data component, fragment colocation, Storybook mock, UI 상태/에러 표시 정책을 일관되게 유지한다.

## GraphQL Colocation

- GraphQL query, mutation, fragment document는 실제로 사용하는 `.svelte` 파일에 둔다.
- 별도 `.ts` 파일로 빼는 것은 여러 파일이 같은 document를 재사용하거나 명확한 boundary가 있을 때만 한다.
- document를 사용하는 파일과 타입이 떨어지면 수동 타입 정의가 늘어나므로 피한다.
- route/page query는 해당 route component에 두고, 자식 컴포넌트에는 fragment spread와 fragment ref로 데이터를 넘긴다.

## Fragment Components

- GraphQL 데이터를 소비하는 컴포넌트는 개별 scalar props를 나열하지 말고 `FragmentRefs<'Component_fragment'>`를 받는다.
- 컴포넌트 내부에서 `$mearie`의 `graphql(...)`와 `createFragment(..., () => props.<name>)`를 사용한다.
- fragment typing을 피하려고 container/view를 나누지 않는다. 실제 책임 분리가 없다면 수동 타입 선언만 늘고 fragment의 장점이 사라진다.
- 컴포넌트가 필요한 데이터는 자신이 fragment로 선언한다.
- 부모는 자식 fragment를 spread해서 넘기고, 자식의 필드 목록을 부모 props 타입으로 복제하지 않는다.

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

## UI And Copy

- backend raw English `message`를 한국어 UI에 그대로 노출하지 않는다.
- 전체 error code mapping이 아직 과하면 generic 한국어 fallback을 먼저 두고, 원문은 logging/debug 용도로만 취급한다.
- handle에 `@`를 붙일지 같은 표시 정책은 컴포넌트마다 ad hoc 처리하지 않는다. API boundary나 공통 formatting helper에서 정한다.
- Figma/OpenSpec의 수치와 Tailwind class 수치가 다르면 코드 또는 spec을 같은 PR에서 정렬한다.
- 긴 표시 이름, 긴 handle, 비어 있는 값 등 layout edge case를 story에 포함한다.
