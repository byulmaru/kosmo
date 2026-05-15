import { cacheExchange, createClient, dedupExchange, httpExchange } from '@mearie/svelte';
import { schema } from '$mearie';

export const client = createClient({
  // @ts-expect-error 왜지??
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange(),
    httpExchange({
      url: '/graphql',
    }),
  ],
});
