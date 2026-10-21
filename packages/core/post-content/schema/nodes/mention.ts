import {
  normalizePostContentMentionHandle,
  normalizePostContentProfileId,
  postContentMentionFallbackText,
} from '../../index';
import type { NodeSpec } from 'prosemirror-model';

export const mentionNodeSpec = {
  atom: true,
  attrs: {
    handle: {
      default: undefined,
      validate: validateMentionHandle,
    },
    profileId: { validate: validateMentionProfileId },
  },
  group: 'inline',
  inline: true,
  marks: '',
  selectable: false,
  toDOM: (node) => ['span', node.attrs.handle ?? postContentMentionFallbackText],
} satisfies NodeSpec;

function validateMentionHandle(value: unknown): void {
  normalizePostContentMentionHandle(value);
}

function validateMentionProfileId(value: unknown): void {
  normalizePostContentProfileId(value);
}
