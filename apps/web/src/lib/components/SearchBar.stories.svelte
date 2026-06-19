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

<!-- 검색 전: 뒤로가기·지우기 없음 -->
<Story name="Default" args={{ placeholder: '검색어' }} />

<!-- 입력 중·검색 후: 값이 있으면 필드 안에 지우기(×) 노출 -->
<Story name="With value" args={{ value: '별마루', placeholder: '검색어' }} />

<!-- 입력 중·검색 후: 좌측 뒤로가기(←) 노출 -->
<Story name="With back" args={{ value: '별마루', placeholder: '검색어', showBack: true }} />
