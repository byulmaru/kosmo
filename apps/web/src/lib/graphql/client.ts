import { cacheExchange, createClient, dedupExchange, httpExchange } from '@mearie/svelte';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange({ fetchPolicy: 'cache-and-network' }),
    httpExchange({
      url: '/graphql',
    }),
  ],
});
