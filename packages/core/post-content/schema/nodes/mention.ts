import { normalizePostContentMentionLabel } from '../../index';
import { normalizeLinkHref } from '../marks/link';
import type { NodeSpec } from 'prosemirror-model';

export const mentionNodeSpec = {
  atom: true,
  attrs: {
    target: { validate: validateMentionUri },
    href: { validate: validateMentionUri },
    label: { validate: validateMentionLabel },
  },
  group: 'inline',
  inline: true,
  marks: '',
  selectable: false,
  parseDOM: [
    {
      tag: 'kosmo-mention[data-target][data-href][data-label]',
      getAttrs(element) {
        const target = element.getAttribute('data-target');
        const href = element.getAttribute('data-href');
        const label = element.getAttribute('data-label');
        if (target === null || href === null || label === null) {
          return false;
        }
        try {
          return {
            href: normalizeLinkHref(href),
            label: normalizePostContentMentionLabel(label),
            target: normalizeLinkHref(target),
          };
        } catch {
          return false;
        }
      },
    },
  ],
  toDOM: (node) => ['a', { href: node.attrs.href }, node.attrs.label],
} satisfies NodeSpec;

function validateMentionUri(value: unknown): void {
  try {
    normalizeLinkHref(value);
  } catch {
    throw new TypeError('Mention URI must use http or https');
  }
}

function validateMentionLabel(value: unknown): void {
  if (typeof value !== 'string') {
    throw new TypeError('Mention label must be a visible string');
  }
  normalizePostContentMentionLabel(value);
}
