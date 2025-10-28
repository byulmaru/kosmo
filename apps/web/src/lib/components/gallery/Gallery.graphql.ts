import { graphql } from '@kosmo/svelte-relay';

export const fragment = graphql`
  fragment Gallery_PostSnapshot_Fragment on PostSnapshot {
    media {
      id

      ...GalleryItem_File_Fragment
    }
  }
`;

export const itemFragment = graphql`
  fragment GalleryItem_File_Fragment on File {
    id
    url
    thumbnailUrl
    placeholder
    alt

    metadata {
      width
      height
    }
  }
`;
