import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type PlaceholderOptions = {
  placeholder: string;
};

export const Placeholder = Extension.create<PlaceholderOptions>({
  name: 'placeholder',

  addOptions() {
    return {
      placeholder: 'Write something...',
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('placeholder'),
        props: {
          decorations: ({ doc, selection }) => {
            if (!this.editor.isEditable) {
              return null;
            }

            if (doc.firstChild?.childCount === 0) {
              return DecorationSet.create(doc, [
                Decoration.node(selection.$anchor.before(), selection.$anchor.after(), {
                  class:
                    'before:content-[attr(data-placeholder)] relative before:absolute before:left-0 before:top-0 before:text-muted-foreground before:pointer-events-none',
                  'data-placeholder': this.options.placeholder,
                }),
              ]);
            }
          },
        },
      }),
    ];
  },
});
