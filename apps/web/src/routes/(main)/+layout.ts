import { graphql, loadQuery } from '@kosmo/svelte-relay';
import type { Layout_Main_Query } from './__generated__/Layout_Main_Query.graphql';

export const load = async ({ parent }) => {
  return {
    query: await loadQuery<Layout_Main_Query>(
      (await parent()).relayEnvironment,
      graphql`
        query Layout_Main_Query {
          languages

          ...AppSidebar_MainLayout_Fragment
        }
      `,
    ),
  };
};
