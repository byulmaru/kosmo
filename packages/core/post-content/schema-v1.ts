import { Schema } from 'prosemirror-model';

type PostContentNodeName = 'doc' | 'hard_break' | 'paragraph' | 'text';
type PostContentMarkName = 'link';

export const postContentSchemaV1 = new Schema<PostContentNodeName, PostContentMarkName>({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block', marks: 'link' },
    text: { group: 'inline' },
    hard_break: { group: 'inline', inline: true, marks: '', selectable: false },
  },
  marks: {
    link: {
      attrs: { href: { validate: validateLinkHref } },
      inclusive: false,
      excludes: 'link',
    },
  },
});

function validateLinkHref(value: unknown): void {
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
}
