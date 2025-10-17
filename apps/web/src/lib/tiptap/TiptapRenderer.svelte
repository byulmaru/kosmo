<script lang="ts">
  import { nodes } from '@kosmo/tiptap';
  import { Editor, generateHTML } from '@tiptap/core';
  import { onMount } from 'svelte';
  import type { JSONContent } from '@tiptap/core';

  type Props = {
    content: JSONContent;
    editor?: Editor;
  };

  let { content, editor = $bindable() }: Props = $props();

  let element = $state<HTMLElement>();
  const html = $derived(generateHTML(content, nodes));

  onMount(() => {
    editor = new Editor({
      element: element,
      extensions: nodes,
      content,
      editable: false,

      editorProps: {
        attributes: {
          class: '',
        },
      },

      onCreate: ({ editor }) => {
        // eslint-disable-next-line svelte/no-dom-manipulating
        element?.replaceWith(editor.view.dom);
      },

      onTransaction: (e) => {
        editor = e.editor;
      },
    });
  });
</script>

<div bind:this={element}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</div>
