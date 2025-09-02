import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment AppSidebar_MainLayout_Fragment on Query {
    usingProfile {
      id
      handle
    }

    ...ProfileDropdown_MainLayout_Fragment
  }
`;
