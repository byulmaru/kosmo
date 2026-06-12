<script module lang="ts">
  import { createTipTapDocumentFromPlainText } from '@kosmo/core/tiptap';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import TipTapRenderer from './TipTapRenderer.svelte';

  const tipTapDocument = (text: string) => createTipTapDocumentFromPlainText(text);

  const { Story } = defineMeta({
    title: 'KOSMO/TipTapRenderer',
    component: TipTapRenderer,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Playground"
  args={{
    document: tipTapDocument('본문이 들어가는 자리예요. 저장된 TipTap 문서를 렌더링합니다.'),
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <TipTapRenderer document={tipTapDocument('짧은 본문 한 줄.')} />
    <TipTapRenderer
      document={tipTapDocument(
        '본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어납니다.\n줄바꿈도 문단으로 렌더링됩니다.\n\n문단 사이 빈 줄도 유지됩니다.',
      )}
    />
    <TipTapRenderer
      document={tipTapDocument(
        '긴단어가포함된본문도부모너비를넘지않고줄바꿈되어야합니다긴단어가포함된본문도부모너비를넘지않고줄바꿈되어야합니다',
      )}
    />
    <TipTapRenderer document={tipTapDocument('')} />
  </div>
</Story>
