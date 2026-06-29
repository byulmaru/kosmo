<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor } from '@tiptap/core';
  import { tipTapExtensions } from '@kosmo/core/tiptap';
  import type { TipTapDocument } from '@kosmo/core/tiptap';

  type Props = {
    placeholder?: string;
    editable?: boolean;
    editor?: Editor | null;
    bodyText?: string;
    document?: TipTapDocument | null;
    focused?: boolean;
    onUpdate?: () => void;
  };

  let {
    placeholder = '',
    editable = true,
    editor = $bindable<Editor | null>(null),
    bodyText = $bindable(''),
    document = $bindable<TipTapDocument | null>(null),
    focused = $bindable(false),
    onUpdate,
  }: Props = $props();

  let editorHost: HTMLDivElement;

  const syncEditorState = () => {
    bodyText = editor?.getText({ blockSeparator: '\n' }).trim() ?? '';
    document = (editor?.getJSON() as TipTapDocument | undefined) ?? null;
  };

  $effect(() => {
    editor?.setEditable(editable);
  });

  onMount(() => {
    editor = new Editor({
      element: editorHost,
      extensions: tipTapExtensions,
      content: document ?? {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      },
      autofocus: false,
      editorProps: {
        attributes: {
          class: 'post-composer-editor',
          'aria-label': '게시글 본문',
        },
        handleDOMEvents: {
          focus: () => {
            focused = true;
            return false;
          },
          blur: () => {
            focused = false;
            syncEditorState();
            return false;
          },
        },
      },
      onUpdate: () => {
        syncEditorState();
        onUpdate?.();
      },
    });

    syncEditorState();
    onUpdate?.();

    return () => {
      editor?.destroy();
      editor = null;
    };
  });
</script>

<div class="relative">
  {#if placeholder && bodyText.length === 0}
    <p class="text-text-secondary pointer-events-none absolute left-4 top-4 m-0 text-base">
      {placeholder}
    </p>
  {/if}
  <div bind:this={editorHost}></div>
</div>

<style>
  :global(.post-composer-editor) {
    min-height: 10rem;
    padding: 1rem;
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.625;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    outline: none;
  }

  :global(.post-composer-editor p) {
    margin: 0;
  }
</style>
