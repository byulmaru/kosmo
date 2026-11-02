import { graphql } from 'react-relay';

export const postListProfilePinsTestQuery = graphql`
  query PostListProfilePinsTestQuery($handle: String!) {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    profileByHandle(handle: $handle) {
      id
      viewerState {
        profileBlock {
          id
        }
      }
      ...PostList_profile @arguments(count: 20)
      ...PostList_profile_pinned
    }
  }
`;
