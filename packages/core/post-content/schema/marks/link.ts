import type { MarkSpec } from 'prosemirror-model';

export const linkMarkSpec = {
  attrs: { href: { validate: validateLinkHref } },
  excludes: 'link',
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs(element) {
        try {
          return { href: normalizeLinkHref(element.getAttribute('href')) };
        } catch {
          return false;
        }
      },
    },
  ],
} satisfies MarkSpec;

export function normalizeLinkHref(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Link href must be a string');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Link href must be an absolute URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Link href must use http or https');
  }

  return url.href;
}

function validateLinkHref(value: unknown): void {
  normalizeLinkHref(value);
}
