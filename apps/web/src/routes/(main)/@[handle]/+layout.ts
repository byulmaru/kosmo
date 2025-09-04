import { graphql, loadQuery } from '@kosmo/svelte-relay';
import type { Layout_MainHandle_Query } from './__generated__/Layout_MainHandle_Query.graphql';

export const load = async ({ params, parent }) => {
  return {
    query: await loadQuery<Layout_MainHandle_Query>(
      (await parent()).relayEnvironment,
      graphql`
        query Layout_MainHandle_Query($handle: String!) {
          profile(handle: $handle) {
            id
            uri
            displayName
            handle
            relativeHandle
            description
            followerCount
            followingCount
            isMe

            relationship {
              to
              from
            }

            instance {
              id
              domain
            }

            ...FollowButton_Profile_Fragment
          }

          usingProfile {
            id
          }
        }
      `,
      { handle: params.handle },
    ),
  };
};
