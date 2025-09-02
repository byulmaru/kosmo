import { graphql } from '@kosmo/svelte-relay';

export const followProfileMutation = graphql`
  mutation layout_followProfile_Mutation($input: FollowProfileInput!) {
    followProfile(input: $input) {
      __typename

      ... on FollowProfileSuccess {
        profile {
          id

          relationship {
            to
            from
          }
        }
      }
    }
  }
`;

export const unfollowProfileMutation = graphql`
  mutation layout_unfollowProfile_Mutation($input: UnfollowProfileInput!) {
    unfollowProfile(input: $input) {
      __typename

      ... on UnfollowProfileSuccess {
        profile {
          id

          relationship {
            to
            from
          }
        }
      }
    }
  }
`;
