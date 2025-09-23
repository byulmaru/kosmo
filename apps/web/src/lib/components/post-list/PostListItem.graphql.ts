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

      ...Avatar_Profile_Fragment
    }

    replyToPost {
      id
      author {
        displayName
        relativeHandle

        ...Avatar_Profile_Fragment
      }
    }

    repostOfPost {
      id
      author {
        displayName
        relativeHandle

        ...Avatar_Profile_Fragment
      }
    }
  }
`;
