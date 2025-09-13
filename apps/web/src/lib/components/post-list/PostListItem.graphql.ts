import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment PostListItem_Post_Fragment on Post {
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
      author {
        displayName
        relativeHandle
      }
    }

    repostOfPost {
      id
      author {
        displayName
        relativeHandle
      }
    }
  }
`;
