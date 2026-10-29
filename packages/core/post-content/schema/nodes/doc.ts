import type { NodeSpec } from 'prosemirror-model';

export const docNodeSpec = {
  attrs: {
    customEmojis: { default: null },
    sensitiveMedia: { default: false },
  },
  content: '(paragraph | media)+',
} satisfies NodeSpec;
