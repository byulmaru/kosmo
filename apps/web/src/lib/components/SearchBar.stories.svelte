<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import SearchBar from './SearchBar.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/SearchBar',
    component: SearchBar,
    tags: ['autodocs'],
    parameters: {
      layout: 'centered',
    },
  });
</script>

<Story name="Default" args={{ placeholder: '검색어' }} />

<Story name="With value" args={{ value: '별마루', placeholder: '검색어' }} />
