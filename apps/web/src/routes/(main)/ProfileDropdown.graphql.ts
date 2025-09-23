import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment ProfileDropdown_MainLayout_Fragment on Query {
    me {
      id

      profiles {
        id
        displayName
        fullHandle

        ...Avatar_Profile_Fragment
      }
    }

    usingProfile {
      id
      displayName
      fullHandle

      ...Avatar_Profile_Fragment
    }
  }
`;

export const createProfileMutation = graphql`
  mutation ProfileDropdown_createProfile_Mutation($input: CreateProfileInput!) {
    createProfile(input: $input) {
      __typename

      ... on CreateProfileSuccess {
        profile {
          id
          displayName
          handle
        }
      }

      ... on ValidationError {
        path
        message
      }
    }
  }
`;

export const useProfileMutation = graphql`
  mutation ProfileDropdown_useProfile_Mutation($input: UseProfileInput!) {
    useProfile(input: $input) {
      __typename

      ... on UseProfileSuccess {
        profile {
          id
          displayName
          handle
        }
      }
    }
  }
`;
