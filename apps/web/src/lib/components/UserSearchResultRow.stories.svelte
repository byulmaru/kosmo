<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import UserSearchResultRow from './UserSearchResultRow.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/UserSearchResultRow',
    component: UserSearchResultRow,
    tags: ['autodocs'],
    argTypes: {
      state: {
        control: 'radio',
        options: ['follow', 'following'],
      },
    },
  });

  const defaultArgs = {
    name: '사용자 이름',
    handle: '@user@kos.moe',
    bio: '한 줄 소개가 들어가는 자리',
  };
</script>

<Story name="Follow" args={{ ...defaultArgs, state: 'follow' }} />
<Story name="Following" args={{ ...defaultArgs, state: 'following' }} />
