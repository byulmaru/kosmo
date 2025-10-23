import { mergeAttributes, Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hardBreak: {
      setHardBreak: () => ReturnType;
    };
  }
}

export const HardBreak = Node.create({
  name: 'hardBreak',
  group: 'inline',
  inline: true,
  selectable: false,
  linebreakReplacement: true,

  parseHTML() {
    return [{ tag: 'br' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['br', mergeAttributes(HTMLAttributes)];
  },

  renderText() {
    return '\n';
  },

  addCommands() {
    return {
      setHardBreak:
        () =>
        ({ commands, chain, state, editor }) => {
          return commands.first([
            () => commands.exitCode(),
            () =>
              commands.command(() => {
                const { selection, storedMarks } = state;

                if (selection.$from.parent.type.spec.isolating) {
                  return false;
                }

                const { splittableMarks } = editor.extensionManager;
                const marks =
                  storedMarks || (selection.$to.parentOffset && selection.$from.marks());

                return chain()
                  .insertContent({ type: this.name })
                  .command(({ tr, dispatch }) => {
                    if (dispatch && marks) {
                      const filteredMarks = marks.filter((mark) =>
                        splittableMarks.includes(mark.type.name),
                      );

                      tr.ensureMarks(filteredMarks);
                    }

                    return true;
                  })
                  .run();
              }),
          ]);
        },
    };
  },
});
