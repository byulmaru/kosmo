<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import RecentSearches from './RecentSearches.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/RecentSearches',
    component: RecentSearches,
    tags: ['autodocs'],
    args: {
      hrefFor: (term: string) => `/search?q=${encodeURIComponent(term)}`,
      onremove: () => {},
    },
  });
</script>

<Story
  name="With history"
  args={{ terms: ['byulmaru', 'kosmo', '@devtest', '긴 검색어 예시입니다 길어지면 잘립니다'] }}
/>

<Story name="Empty" args={{ terms: [] }} />
