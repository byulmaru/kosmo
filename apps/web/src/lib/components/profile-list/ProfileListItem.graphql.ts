import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment ProfileListItem_Profile_Fragment on Profile {
    id
    displayName
    relativeHandle
    fullHandle
    description

    relationship {
      to
      from
    }

    ...FollowButton_Profile_Fragment
    ...Avatar_Profile_Fragment
  }
`;
