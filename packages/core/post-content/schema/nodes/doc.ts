import type { NodeSpec } from 'prosemirror-model';

export const docNodeSpec = {
  attrs: {
    sensitiveMedia: { default: false },
  },
  content: '(paragraph | media)+',
} satisfies NodeSpec;
