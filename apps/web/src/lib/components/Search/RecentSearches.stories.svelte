<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import RecentSearches from './RecentSearches.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/RecentSearches',
    component: RecentSearches,
    tags: ['autodocs'],
    args: {
      onselect: () => {},
      onremove: () => {},
    },
  });
</script>

<Story
  name="With history"
  args={{ terms: ['byulmaru', 'kosmo', '@devtest', '긴 검색어 예시입니다 길어지면 잘립니다'] }}
/>

<Story name="Empty" args={{ terms: [] }} />
