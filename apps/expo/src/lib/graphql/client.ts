// src/lib/graphql-client.ts
import { cacheExchange, createClient, dedupExchange, httpExchange } from '@mearie/react';
import { schema } from '$mearie';

export const client = createClient({
  schema,
  exchanges: [
    dedupExchange(),
    cacheExchange(),
    httpExchange({
      url: 'http://localhost:8260/graphql',
    }),
  ],
});
