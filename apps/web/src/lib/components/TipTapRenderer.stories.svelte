<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import type { TipTapDocument } from '@kosmo/core/tiptap';

  import TipTapRenderer from './TipTapRenderer.svelte';

  const playgroundDocument = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '본문이 들어가는 자리예요.' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '저장된 TipTap 문서를 렌더링합니다.' }],
      },
    ],
  } satisfies TipTapDocument;

  const shortDocument = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '짧은 본문 한 줄.' }],
      },
    ],
  } satisfies TipTapDocument;

  const multilineDocument = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어납니다.' },
        ],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '줄바꿈도 문단으로 렌더링됩니다.' }],
      },
      {
        type: 'paragraph',
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '문단 사이 빈 줄도 유지됩니다.' }],
      },
    ],
  } satisfies TipTapDocument;

  const longWordDocument = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '긴단어가포함된본문도부모너비를넘지않고줄바꿈되어야합니다긴단어가포함된본문도부모너비를넘지않고줄바꿈되어야합니다',
          },
        ],
      },
    ],
  } satisfies TipTapDocument;

  const emptyDocument = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  } satisfies TipTapDocument;

  const { Story } = defineMeta({
    title: 'KOSMO/TipTapRenderer',
    component: TipTapRenderer,
    tags: ['autodocs'],
    argTypes: {
      document: {
        control: 'object',
      },
    },
  });
</script>

<Story name="Playground" args={{ class: 'w-[600px]', document: playgroundDocument }} />

<Story
  name="Short"
  args={{ class: 'w-[600px]', document: shortDocument }}
  parameters={{ controls: { disable: true } }}
/>

<Story
  name="Multiline"
  args={{ class: 'w-[600px]', document: multilineDocument }}
  parameters={{ controls: { disable: true } }}
/>

<Story
  name="LongWord"
  args={{ class: 'w-[600px]', document: longWordDocument }}
  parameters={{ controls: { disable: true } }}
/>

<Story
  name="Empty"
  args={{ class: 'w-[600px]', document: emptyDocument }}
  parameters={{ controls: { disable: true } }}
/>
