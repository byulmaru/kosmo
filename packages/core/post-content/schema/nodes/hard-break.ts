import type { NodeSpec } from 'prosemirror-model';

export const hardBreakNodeSpec = {
  group: 'inline',
  inline: true,
  marks: '',
  parseDOM: [{ tag: 'br' }],
  selectable: false,
} satisfies NodeSpec;
