import { graphql, loadQuery } from '@kosmo/svelte-relay';
import * as Sentry from '@sentry/sveltekit';
import type { Layout_Main_Query } from './__generated__/Layout_Main_Query.graphql';

export const load = async ({ parent }) => {
  const query = await loadQuery<Layout_Main_Query>(
    (await parent()).relayEnvironment,
    graphql`
      query Layout_Main_Query {
        languages

        me {
          id
          name
        }

        usingProfile {
          id
          handle

          ...WritePost_Profile_Fragment
        }

        ...AppSidebar_MainLayout_Fragment
      }
    `,
  );

  Sentry.setUser(
    query.data.me
      ? {
          id: query.data.me.id,
          username: query.data.me.name,
          profileId: query.data.usingProfile?.id,
          profileHandle: query.data.usingProfile?.handle,
        }
      : null,
  );

  return {
    query,
  };
};
