import { graphql } from 'react-relay';

export const NativePushRegisterInstallationMutation = graphql`
  mutation NativePushRegisterInstallationMutation(
    $platform: PushInstallationPlatform!
    $token: String!
  ) {
    registerPushInstallation(input: { platform: $platform, token: $token }) {
      id
    }
  }
`;

export const NativePushUpdateInstallationMutation = graphql`
  mutation NativePushUpdateInstallationMutation(
    $id: ID!
    $platform: PushInstallationPlatform!
    $token: String!
  ) {
    updatePushInstallation(input: { id: $id, platform: $platform, token: $token }) {
      completed
    }
  }
`;

export const NativePushUnregisterInstallationMutation = graphql`
  mutation NativePushUnregisterInstallationMutation($id: ID!) {
    unregisterPushInstallation(input: { id: $id }) {
      completed
    }
  }
`;

export const NativePushSelectProfileMutation = graphql`
  mutation NativePushSelectProfileMutation($id: ID!) {
    selectProfile(input: { id: $id }) {
      profile {
        id
      }
    }
  }
`;

export const NativePushNotificationTargetQuery = graphql`
  query NativePushNotificationTargetQuery($notificationId: ID!) {
    node(id: $notificationId) {
      __typename
      ... on FollowNotification {
        profile {
          relativeHandle
        }
      }
      ... on FollowRequestNotification {
        id
      }
      ... on ReactionNotification {
        post {
          id
          profile {
            relativeHandle
          }
        }
      }
      ... on RepostNotification {
        post {
          id
          profile {
            relativeHandle
          }
        }
      }
      ... on ReplyNotification {
        post {
          id
          profile {
            relativeHandle
          }
        }
      }
    }
  }
`;
