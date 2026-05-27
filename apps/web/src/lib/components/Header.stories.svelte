<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import Header from './Header.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/Header',
    component: Header,
    tags: ['autodocs'],
    argTypes: {
      variant: {
        control: 'select',
        options: [
          'default',
          'search_main',
          'search_input',
          'title_action',
          'back_title',
          'cancel_action',
          'cancel_apply',
        ],
      },
    },
    parameters: {
      layout: 'centered',
    },
  });
</script>

<script lang="ts">
  const variants = [
    'default',
    'search_main',
    'search_input',
    'title_action',
    'back_title',
    'cancel_action',
    'cancel_apply',
  ] as const;
</script>

<Story
  name="Playground"
  args={{ variant: 'default', title: '알림', inputText: '검색어 입력중...', actionLabel: '게시' }}
/>

<Story name="Variants" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4">
    {#each variants as variant}
      <Header {variant} title={variant === 'title_action' ? '알림' : '타이틀'} />
    {/each}
  </div>
</Story>
