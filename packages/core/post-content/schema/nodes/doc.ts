import type { NodeSpec } from 'prosemirror-model';

export const docNodeSpec = {
  content: 'paragraph+',
} satisfies NodeSpec;
