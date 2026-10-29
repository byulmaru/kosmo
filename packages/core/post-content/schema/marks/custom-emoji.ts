import type { MarkSpec } from 'prosemirror-model';

export const customEmojiMarkSpec = {
  attrs: { url: { validate: validateCustomEmojiUrl } },
  inclusive: false,
  toDOM: () => ['span', 0],
} satisfies MarkSpec;

export function normalizeCustomEmojiUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Custom Emoji URL must be a string');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Custom Emoji URL must be an absolute URL');
  }
  if (url.protocol !== 'https:') {
    throw new TypeError('Custom Emoji URL must use https');
  }
  if (url.username || url.password) {
    throw new TypeError('Custom Emoji URL must not contain credentials');
  }

  return url.href;
}

function validateCustomEmojiUrl(value: unknown): void {
  normalizeCustomEmojiUrl(value);
}
