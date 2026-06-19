<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import SearchTabs from './SearchTabs.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/SearchTabs',
    component: SearchTabs,
    tags: ['autodocs'],
    argTypes: {
      active: {
        control: 'radio',
        options: ['인기', '최신', '미디어', '사람'],
      },
    },
    parameters: {
      layout: 'centered',
    },
  });
</script>

<script lang="ts">
  const tabs = ['인기', '최신', '미디어', '사람'] as const;
</script>

<Story name="Playground" args={{ active: '인기' }} />

<Story name="Variants" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4">
    {#each tabs as active}
      <SearchTabs {active} />
    {/each}
  </div>
</Story>
