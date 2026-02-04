import { nodes } from '@kosmo/tiptap';
import { JSONContent } from '@tiptap/core';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';

type Props = {
  content: JSONContent | null;
};

export default function TiptapRenderer({ content }: Props) {
  if (!content) {
    return null;
  }

  return renderToReactElement({
    extensions: nodes,
    content,
  });
}
