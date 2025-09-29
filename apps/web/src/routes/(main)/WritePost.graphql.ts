import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment WritePost_Profile_Fragment on Profile {
    id
    displayName
    fullHandle
    relativeHandle

    config {
      defaultPostVisibility
    }

    ...Avatar_Profile_Fragment
  }
`;

export const createPostMutation = graphql`
  mutation WritePost_createPost_Mutation($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename

      ... on CreatePostSuccess {
        post {
          id
        }
      }
    }
  }
`;
