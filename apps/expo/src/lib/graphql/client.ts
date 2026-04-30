import { cacheExchange, createClient, dedupExchange, httpExchange } from '@mearie/react';
import { schema } from '$mearie';

const graphqlUrl = process.env.EXPO_PUBLIC_ORIGIN
  ? new URL('/graphql', process.env.EXPO_PUBLIC_ORIGIN).toString()
  : '/graphql';

export const client = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange(),
    httpExchange({
      url: graphqlUrl,
    }),
  ],
});
