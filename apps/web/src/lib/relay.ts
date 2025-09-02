import { createRelayEnvironment } from '@kosmo/svelte-relay';

export const createSSRRelayEnvironment = (ssrFetch: typeof globalThis.fetch) => {
  return createRelayEnvironment({
    network: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      fetch: async (params, variables, cacheConfig) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        const body = JSON.stringify({
          query: params.text,
          variables,
        });

        const resp = await ssrFetch('/graphql', {
          method: 'POST',
          headers,
          body,
        });

        return await resp.json();
      },
    },
  });
};
