import { Extension } from '@tiptap/core';

export const Keymap = Extension.create({
  name: 'keymap',

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.first(({ commands }) => [() => commands.setHardBreak()]),
    };
  },
});
