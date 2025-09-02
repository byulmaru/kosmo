# @kosmo/svelte-relay

React Relay와 같은 경험을 Svelte에서 제공하는 relay-runtime 기반 GraphQL 클라이언트입니다.
**SvelteKit과의 완벽한 통합**을 통해 SSR, preloading, hydration을 지원합니다.

## 특징

- 🚀 **SvelteKit 네이티브 통합**: `+page.ts` load 함수에서 쿼리 preloading
- 💧 **자동 Hydration**: 서버 데이터가 클라이언트 store에 자동 연결
- 🔄 **Reactive Stores**: Svelte의 반응형 시스템과 완벽 호환
- 🎯 **타입 안정성**: TypeScript와 Relay의 강력한 타입 시스템
- ⚡ **성능 최적화**: 불필요한 중복 요청 방지
- 🧩 **Fragment Composition**: 컴포넌트 단위 데이터 요구사항 정의

## 설치

```bash
pnpm add @kosmo/svelte-relay relay-runtime
pnpm add -D @types/relay-runtime relay-compiler
```

## 빠른 시작

### 1. Relay Environment 설정

```typescript
// src/lib/relay.ts
import { createRelayEnvironment, createSSRRelayEnvironment } from '@kosmo/svelte-relay';
import { browser } from '$app/environment';

export const createEnvironment = (fetch: any) => {
  const config = {
    network: {
      fetch: async (params: any, variables: any) => {
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: params.text, variables }),
        });
        return response.json();
      },
    },
  };

  return browser ? createRelayEnvironment(config) : createSSRRelayEnvironment(config);
};
```

### 2. Layout에서 Environment 초기화

```typescript
// src/routes/+layout.ts
import { createEnvironment } from '$lib/relay.js';

export async function load({ fetch }) {
  return {
    environment: createEnvironment(fetch),
  };
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { setRelayEnvironment } from '@kosmo/svelte-relay';

  const { data, children } = $props();
  setRelayEnvironment(data.environment);
</script>

{@render children()}
```

### 3. Page에서 쿼리 Preload

```typescript
// src/routes/users/[id]/+page.ts
import { graphql, loadQuery } from '@kosmo/svelte-relay';
import { createEnvironment } from '$lib/relay.js';

const USER_QUERY = graphql\`
  query UserPageQuery($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
\`;

export async function load({ params, fetch }) {
  const environment = createEnvironment(fetch);
  const userQuery = await loadQuery(environment, USER_QUERY, { id: params.id });

  return {
    relayQueries: {
      [userQuery.queryKey]: userQuery
    }
  };
}
```

```svelte
<!-- src/routes/users/[id]/+page.svelte -->
<script lang="ts">
  import { graphql, createPreloadedQuery, getPreloadedQuery } from '@kosmo/svelte-relay';
  
  const { data } = $props();
  
  const USER_QUERY = graphql\`
    query UserPageQuery($id: ID!) {
      user(id: $id) {
        id
        name
        email
      }
    }
  \`;
  
  const preloadedData = getPreloadedQuery(data, 'UserPageQuery:{"id":"' + data.params?.id + '"}');
  const userQuery = createPreloadedQuery(USER_QUERY, { id: data.params?.id }, preloadedData);
</script>

{#if $userQuery.loading}
  <p>Loading...</p>
{:else if $userQuery.error}
  <p>Error: {$userQuery.error.message}</p>
{:else if $userQuery.data?.user}
  <h1>{$userQuery.data.user.name}</h1>
  <p>{$userQuery.data.user.email}</p>
{/if}
```

## API Reference

### Query Hooks

- `createQuery(query, variables, environment?)` - 기본 쿼리 실행
- `createPreloadedQuery(query, variables, preloadedData?, environment?)` - Preload된 데이터와 함께 쿼리
- `loadQuery(environment, query, variables)` - Load 함수에서 쿼리 실행

### Mutation Hooks

- `createMutation(mutation, environment?)` - Mutation 실행

### Fragment Hooks

- `createFragment(fragment, fragmentRef, environment?)` - Fragment 데이터 읽기

### Subscription Hooks

- `createSubscription(subscription, variables, environment?)` - 실시간 구독

### Utilities

- `loadQueries(environment, queries)` - 여러 쿼리 병렬 실행
- `getPreloadedQuery(pageData, queryKey)` - Page 데이터에서 preload된 쿼리 추출
- `createSSRRelayEnvironment(config)` - SSR 전용 Environment

## 자세한 예제

더 자세한 사용법과 예제는 [examples/sveltekit-integration.md](./examples/sveltekit-integration.md)를 참고하세요.

## 기존 시스템에서 마이그레이션

현재 다른 GraphQL 클라이언트를 사용 중이라면, [MIGRATION.md](./MIGRATION.md)에서 단계별 마이그레이션 가이드를 확인하세요.
