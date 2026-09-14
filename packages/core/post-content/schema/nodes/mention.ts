import { normalizePostContentProfileId, postContentMentionFallbackText } from '../../index';
import type { NodeSpec } from 'prosemirror-model';

export const mentionNodeSpec = {
  atom: true,
  attrs: {
    profileId: { validate: validateMentionProfileId },
  },
  group: 'inline',
  inline: true,
  marks: '',
  selectable: false,
  toDOM: () => ['span', postContentMentionFallbackText],
} satisfies NodeSpec;

function validateMentionProfileId(value: unknown): void {
  normalizePostContentProfileId(value);
}
