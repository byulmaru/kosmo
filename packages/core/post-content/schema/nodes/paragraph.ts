import type { NodeSpec } from 'prosemirror-model';

export const paragraphNodeSpec = {
  content: 'inline*',
  group: 'block',
  marks: 'link custom_emoji',
  parseDOM: [{ tag: 'p' }],
  toDOM: () => ['p', 0],
} satisfies NodeSpec;
