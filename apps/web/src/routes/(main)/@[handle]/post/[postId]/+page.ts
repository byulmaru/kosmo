import { graphql, loadQuery } from '@kosmo/svelte-relay';
import type { Page_Post_Query } from './__generated__/Page_Post_Query.graphql';

export const load = async ({ params, parent }) => {
  return {
    query: await loadQuery<Page_Post_Query>(
      (await parent()).relayEnvironment,
      graphql`
        query Page_Post_Query($postId: ID!) {
          node(id: $postId) {
            __typename

            ... on Post {
              id
              createdAt
              visibility
              state

              snapshot {
                id
                content

                ...Gallery_PostSnapshot_Fragment
              }

              author {
                ...ProfileInfo_Profile_Fragment
              }

              replyToPost {
                id
                content
                author {
                  relativeHandle
                }
              }

              repostOfPost {
                id
                content
                author {
                  relativeHandle
                }
              }
            }
          }
        }
      `,
      { postId: params.postId },
    ),
  };
};
