import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment AppSidebar_MainLayout_Fragment on Query {
    usingProfile {
      id
      relativeHandle

      ...Avatar_Profile_Fragment
    }

    ...ProfileDropdown_MainLayout_Fragment
  }
`;
