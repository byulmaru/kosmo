import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment ProfileInfo_Profile_Fragment on Profile {
    id
    displayName
    fullHandle
    relativeHandle

    ...Avatar_Profile_Fragment
  }
`;
