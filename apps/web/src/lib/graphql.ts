import { cacheExchange, createClient, errorExchange, fetchExchange } from '@typie/sark';

// eslint-disable-next-line import/no-default-export
export default createClient({
  url: '/graphql',
  fetchOptions: {
    
  },
  exchanges: [
    errorExchange((err) => {
      return err;
    }),
    cacheExchange(),
    fetchExchange(),
  ],
});
