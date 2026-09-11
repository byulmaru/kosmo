import { normalizePostContentMentionLabel, normalizePostContentProfileId } from '../../index';
import type { NodeSpec } from 'prosemirror-model';

export const mentionNodeSpec = {
  atom: true,
  attrs: {
    profileId: { validate: validateMentionProfileId },
    label: { validate: validateMentionLabel },
  },
  group: 'inline',
  inline: true,
  marks: '',
  selectable: false,
  toDOM: (node) => ['span', node.attrs.label],
} satisfies NodeSpec;

function validateMentionProfileId(value: unknown): void {
  normalizePostContentProfileId(value);
}

function validateMentionLabel(value: unknown): void {
  if (typeof value !== 'string') {
    throw new TypeError('Mention label must be a visible string');
  }
  normalizePostContentMentionLabel(value);
}
