import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment ProfileInfo_Profile_Fragment on Profile
  @argumentDefinitions(relationship: { type: "Boolean", defaultValue: false }) {
    id
    displayName
    fullHandle
    relativeHandle

    relationship @include(if: $relationship) {
      to
      from
    }

    ...Avatar_Profile_Fragment
  }
`;
