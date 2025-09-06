import { graphql, loadQuery } from '@kosmo/svelte-relay';
import type { Page_MainHandleFollowers_Query } from './__generated__/Page_MainHandleFollowers_Query.graphql';

export const load = async ({ params, parent }) => {
  return {
    query: await loadQuery<Page_MainHandleFollowers_Query>(
      (await parent()).relayEnvironment,
      graphql`
        query Page_MainHandleFollowers_Query($handle: String!) {
          profile(handle: $handle) @required(action: THROW) {
            id
            relativeHandle

            ...Page_MainHandleFollowers_Fragment
          }
        }
      `,
      { handle: params.handle },
    ),

    fragment: graphql`
      fragment Page_MainHandleFollowers_Fragment on Profile
      @argumentDefinitions(cursor: { type: "String" }, count: { type: "Int", defaultValue: 20 })
      @refetchable(queryName: "Page_MainHandleFollowers_Fragment_refetch") {
        followers(after: $cursor, first: $count)
          @connection(key: "Page_MainHandleFollowers_Fragment_followers") {
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
