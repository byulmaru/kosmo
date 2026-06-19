<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import SearchResults from './SearchResults.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/SearchResults',
    component: SearchResults,
    tags: ['autodocs'],
  });
</script>

<Story name="Playground" args={{ query: '별마루' }} />

<!-- 사람 탭 검색 상태 전체: 입력 전(idle), 로딩, 오류, 결과 없음. 실제 query 연결은 PROD-154. -->
<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[390px] gap-8">
    <SearchResults />
    <SearchResults query="별마루" loading />
    <SearchResults query="별마루" error onRetry={() => {}} />
    <SearchResults query="없는핸들" />
  </div>
</Story>
