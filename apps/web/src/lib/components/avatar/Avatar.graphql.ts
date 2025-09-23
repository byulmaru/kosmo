import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment Avatar_Profile_Fragment on Profile {
    avatar {
      id
      url
      placeholder
    }
  }
`;
