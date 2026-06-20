<script module lang="ts">
  import { SEARCH_TABS, SearchTab } from '@kosmo/core/search';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import SearchTabs from './SearchTabs.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/SearchTabs',
    component: SearchTabs,
    tags: ['autodocs'],
    argTypes: {
      active: {
        control: 'radio',
        options: SEARCH_TABS,
      },
    },
    parameters: {
      layout: 'centered',
    },
  });
</script>

<Story name="Playground" args={{ active: SearchTab.POPULAR }} />

<Story name="Variants" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4">
    {#each SEARCH_TABS as active}
      <SearchTabs {active} />
    {/each}
  </div>
</Story>
