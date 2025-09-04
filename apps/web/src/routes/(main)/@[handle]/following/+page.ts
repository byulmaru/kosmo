import { graphql, loadQuery } from '@kosmo/svelte-relay';
import type { Page_MainHandleFollowing_Query } from './__generated__/Page_MainHandleFollowing_Query.graphql';

export const load = async ({ params, parent }) => {
  return {
    query: await loadQuery<Page_MainHandleFollowing_Query>(
      (await parent()).relayEnvironment,
      graphql`
        query Page_MainHandleFollowing_Query($handle: String!) {
          profile(handle: $handle) @required(action: THROW) {
            id
            handle

            ...Page_MainHandleFollowing_Fragment
          }
        }
      `,
      { handle: params.handle },
    ),

    fragment: graphql`
      fragment Page_MainHandleFollowing_Fragment on Profile
      @argumentDefinitions(cursor: { type: "String" }, count: { type: "Int", defaultValue: 20 })
      @refetchable(queryName: "Page_MainHandleFollowing_Fragment_refetch") {
        following(after: $cursor, first: $count)
          @connection(key: "Page_MainHandleFollowing_Fragment_following") {
          edges {
            node {
              id

              ...ProfileListItem_Profile_Fragment
            }
          }

          pageInfo {
            hasNextPage
          }
        }
      }
    `,
  };
};
