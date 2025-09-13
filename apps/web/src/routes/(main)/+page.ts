import { graphql, loadQuery } from '@kosmo/svelte-relay';
import type { Page_MainTimeline_Query } from './__generated__/Page_MainTimeline_Query.graphql';

export const load = async ({ parent }) => {
  return {
    query: await loadQuery<Page_MainTimeline_Query>(
      (await parent()).relayEnvironment,
      graphql`
        query Page_MainTimeline_Query {
          ...Page_MainTimeline_Fragment
        }
      `,
      {},
    ),

    fragment: graphql`
      fragment Page_MainTimeline_Fragment on Query
      @argumentDefinitions(cursor: { type: "String" }, count: { type: "Int", defaultValue: 50 })
      @refetchable(queryName: "Page_MainTimeline_Fragment_refetch") {
        timeline(after: $cursor, first: $count)
          @connection(key: "Page_MainTimeline_Fragment_timeline") {
          edges {
            node {
              id

              ...PostListItem_Post_Fragment
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
