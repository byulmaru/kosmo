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

<Story name="Default" args={{ query: '검색어' }} />
