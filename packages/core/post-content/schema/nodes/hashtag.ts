import { normalizePostContentHashtagId, normalizePostContentHashtagToken } from '../../index';
import type { NodeSpec } from 'prosemirror-model';

export const hashtagNodeSpec = {
  atom: true,
  attrs: {
    hashtagId: { validate: validateHashtagId },
    token: { validate: validateHashtagToken },
  },
  group: 'inline',
  inline: true,
  marks: '',
  selectable: false,
  toDOM: (node) => ['span', node.attrs.token],
} satisfies NodeSpec;

function validateHashtagId(value: unknown): void {
  normalizePostContentHashtagId(value);
}

function validateHashtagToken(value: unknown): void {
  normalizePostContentHashtagToken(value);
}
