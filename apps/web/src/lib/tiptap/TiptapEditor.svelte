<script lang="ts">
  import { nodes } from '@kosmo/tiptap';
  import { Editor } from '@tiptap/core';
  import { onDestroy, onMount } from 'svelte';
  import { i18n } from '$lib/i18n.svelte';
  import { Keymap } from './extensions/keymap';
  import { Placeholder } from './extensions/placeholder';
  import type { EditorView } from '@tiptap/pm/view';

  type Props = {
    class?: string;
    editor?: Editor;
    onkeydown?: (view: EditorView, event: KeyboardEvent) => void;
  };

  let { class: className, editor = $bindable(), onkeydown }: Props = $props();

  let element: HTMLElement | undefined = $state(undefined);

  onMount(() => {
    editor = new Editor({
      element: element,
      extensions: [
        ...nodes,
        Placeholder.configure({ placeholder: $i18n('post.write.placeholder') }),
        Keymap,
      ],
      content: '',

      editorProps: {
        attributes: {
          class: 'h-full min-h-24 touch-none select-none outline-none',
        },

        handleKeyDown: onkeydown,
      },

      onTransaction: (e) => {
        editor = e.editor;
      },
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });
</script>

<div bind:this={element} class={className}></div>
