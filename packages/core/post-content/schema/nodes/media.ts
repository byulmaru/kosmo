import type { NodeSpec } from 'prosemirror-model';

export const mediaNodeSpec = {
  atom: true,
  attrs: {
    altText: { default: null },
    mediaId: {},
  },
  group: 'block',
} satisfies NodeSpec;
