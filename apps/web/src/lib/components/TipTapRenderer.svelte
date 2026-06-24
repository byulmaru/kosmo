<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor } from '@tiptap/core';
  import { tipTapExtensions } from '@kosmo/core/tiptap';
  import type { TipTapDocument } from '@kosmo/core/tiptap';
  import type { HTMLAttributes } from 'svelte/elements';

  import { tv } from '$lib/tv';

  // 본문 강조 크기. 목록(feed)=md(16px) / 상세(detail)=lg(20px). Figma 의도(상세 anchor 본문 강조, PROD-173).
  // 폰트 크기·줄간격은 Foundation 토큰 유틸리티(text-md/text-lg)를 외곽 wrapper에 적용해 .tiptap-renderer가
  // 상속한다. 문단 간격·공백 처리 등 그 외 렌더 규칙은 size와 무관하게 공통이다.
  type Props = Omit<HTMLAttributes<HTMLDivElement>, 'class'> & {
    document: TipTapDocument;
    size?: 'md' | 'lg';
    // tailwind-merge가 ClassValue(숫자·딕셔너리)를 받지 못하므로 문자열로 좁힌다.
    class?: string | null;
  };

  let { document, size = 'md', class: className, ...attributes }: Props = $props();

  const renderer = tv({
    variants: {
      size: {
        md: 'text-md',
        lg: 'text-lg',
      },
    },
  });

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

<div {...attributes} class={renderer({ size, class: className })}>
  <div bind:this={editorHost}></div>
</div>

<style>
  /* 폰트 크기·줄간격은 외곽 wrapper의 text-md/text-lg에서 상속한다(size 변형). */
  :global(.tiptap-renderer) {
    color: var(--color-text-primary);
    font-family: var(--font-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere !important;
    outline: none;
  }

  :global(.tiptap-renderer p) {
    margin: 0 0 0.75rem;
  }

  :global(.tiptap-renderer p:last-child) {
    margin-bottom: 0;
  }
</style>
