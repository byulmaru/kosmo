import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment FollowButton_Profile_Fragment on Profile {
    id
    isMe
    followerCount

    relationship {
      to
      from
    }
  }
`;

export const followProfileMutation = graphql`
  mutation FollowButton_followProfile_Mutation($input: FollowProfileInput!) {
    followProfile(input: $input) {
      __typename

      ... on FollowProfileSuccess {
        profile {
          id
          followerCount

          relationship {
            to
          }
        }
      }
    }
  }
`;

export const unfollowProfileMutation = graphql`
  mutation FollowButton_unfollowProfile_Mutation($input: UnfollowProfileInput!) {
    unfollowProfile(input: $input) {
      __typename

      ... on UnfollowProfileSuccess {
        profile {
          id
          followerCount

          relationship {
            to
          }
        }
      }
    }
  }
`;
