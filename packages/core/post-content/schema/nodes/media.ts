import type { NodeSpec } from 'prosemirror-model';

export const mediaNodeSpec = {
  atom: true,
  attrs: {
    mediaId: {},
  },
  group: 'block',
} satisfies NodeSpec;
