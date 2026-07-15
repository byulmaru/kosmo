import { graphql } from 'react-relay';

export const rejectProfileFollowRequestForStore = graphql`
  mutation ProfileFollowRequestStoreRejectMutation($connections: [ID!]!, $id: ID!) {
    rejectProfileFollowRequest(input: { id: $id }) {
      profileFollowRequestId @deleteEdge(connections: $connections)
      followeeProfile {
        id
      }
    }
  }
`;

export const cancelProfileFollowRequestForStore = graphql`
  mutation ProfileFollowRequestStoreCancelMutation($connections: [ID!]!, $id: ID!) {
    cancelProfileFollowRequest(input: { id: $id }) {
      profileFollowRequestId @deleteEdge(connections: $connections)
      followerProfile {
        id
      }
    }
  }
`;
