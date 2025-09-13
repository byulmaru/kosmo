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
              content
              createdAt
              visibility
              state

              author {
                id
                displayName
                relativeHandle
                fullHandle
              }

              replyToPost {
                id
                content
                author {
                  displayName
                  relativeHandle
                }
              }

              repostOfPost {
                id
                content
                author {
                  displayName
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
