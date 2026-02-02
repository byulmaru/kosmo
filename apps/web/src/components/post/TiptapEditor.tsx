import { nodes } from '@kosmo/tiptap';
import { EditorContent, JSONContent, useEditor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { cn } from 'tailwind-variants';
import { Keymap } from '@/lib/tiptap/extensions/keymap';
import { Placeholder } from '@/lib/tiptap/extensions/placeholder';

type Props = {
  className?: string;
  onUpdate?: (content: JSONContent) => void;
};

export default function TiptapEditor({ className, onUpdate }: Props) {
  const { t } = useTranslation('post');

  const editor = useEditor({
    extensions: [
      ...nodes,
      Placeholder.configure({
        placeholder: t('write.placeholder'),
      }),
      Keymap,
    ],

    immediatelyRender: false,
    content: '',

    editorProps: {
      attributes: {
        class: cn('touch-pan-y select-none outline-none', className) ?? '',
      },
    },

    onUpdate({ editor }) {
      onUpdate?.(editor.getJSON());
    },
  });

  if (!editor) {
    return <div className={className}></div>;
  }

  return <EditorContent editor={editor} />;
}
