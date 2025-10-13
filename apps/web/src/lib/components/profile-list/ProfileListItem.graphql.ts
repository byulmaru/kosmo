import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment ProfileListItem_Profile_Fragment on Profile {
    id
    description

    ...FollowButton_Profile_Fragment
    ...ProfileInfo_Profile_WithRelationship_Fragment
  }
`;
