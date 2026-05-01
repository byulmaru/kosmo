import { cacheExchange, createClient, dedupExchange } from '@mearie/react';
import { schema } from '$mearie';
import { expoFetchExchange } from './expo-fetch-exchange';

export const client = createClient({
  schema,
  exchanges: [dedupExchange(), cacheExchange(), expoFetchExchange()],
});
