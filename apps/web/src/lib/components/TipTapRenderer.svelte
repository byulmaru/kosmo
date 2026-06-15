<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor } from '@tiptap/core';
  import { tipTapExtensions } from '@kosmo/core/tiptap';
  import type { TipTapDocument } from '@kosmo/core/tiptap';
  import type { HTMLAttributes } from 'svelte/elements';

  type Props = HTMLAttributes<HTMLDivElement> & {
    document: TipTapDocument;
  };

  let { document, class: className, ...attributes }: Props = $props();

  let editor = $state<Editor | null>(null);
  let editorHost: HTMLDivElement;

  $effect(() => {
    editor?.commands.setContent(document, { emitUpdate: false });
  });

  onMount(() => {
    editor = new Editor({
      element: editorHost,
      extensions: tipTapExtensions,
      content: document,
      editable: false,
      autofocus: false,
      editorProps: {
        attributes: {
          class: 'tiptap-renderer',
        },
      },
    });

    return () => {
      editor?.destroy();
      editor = null;
    };
  });
</script>

<div {...attributes} class={className}>
  <div bind:this={editorHost}></div>
</div>

<style>
  :global(.tiptap-renderer) {
    color: var(--color-text-primary);
    font-size: var(--text-md);
    line-height: var(--text-md--line-height);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    outline: none;
  }

  :global(.tiptap-renderer p) {
    margin: 0 0 0.75rem;
  }

  :global(.tiptap-renderer p:last-child) {
    margin-bottom: 0;
  }
</style>
