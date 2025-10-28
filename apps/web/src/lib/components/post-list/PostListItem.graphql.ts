import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment PostListItem_Post_Fragment on Post {
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
      id
      displayName
      relativeHandle
      fullHandle

      ...ProfileInfo_Profile_Fragment
    }

    replyToPost {
      id
      author {
        displayName
        relativeHandle

        ...ProfileInfo_Profile_Fragment
      }
    }

    repostOfPost {
      id
      author {
        displayName
        relativeHandle

        ...ProfileInfo_Profile_Fragment
      }
    }
  }
`;
