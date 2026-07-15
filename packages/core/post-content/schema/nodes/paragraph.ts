import type { NodeSpec } from 'prosemirror-model';

export const paragraphNodeSpec = {
  content: 'inline*',
  group: 'block',
  marks: 'link',
  parseDOM: [{ tag: 'p' }],
} satisfies NodeSpec;
