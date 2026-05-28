import { graphql } from '$mearie';

export const sidebarProfilesQuery = graphql(`
  query SidebarProfilesQuery {
    currentSession {
      selectedProfile {
        id
        handle
        displayName
        followersCount
        followingCount
      }
    }
    myProfiles {
      id
      handle
      displayName
      followersCount
      followingCount
    }
  }
`);

export const selectSidebarProfileMutation = graphql(`
  mutation SelectSidebarProfileMutation($id: ID!) {
    selectProfile(input: { id: $id }) {
      __typename
      ... on SelectProfileSuccess {
        profile {
          id
          handle
          displayName
        }
      }
      ... on NotFoundError {
        message
      }
    }
  }
`);
