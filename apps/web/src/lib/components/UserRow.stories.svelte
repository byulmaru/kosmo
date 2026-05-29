<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import UserRow from './UserRow.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/UserRow',
    component: UserRow,
    tags: ['autodocs'],
    argTypes: {
      state: {
        control: 'radio',
        options: ['follow', 'following'],
      },
      width: {
        control: 'radio',
        options: ['compact', 'wide'],
      },
    },
  });
</script>

<Story
  name="Playground"
  args={{
    state: 'follow',
    name: '사용자 이름',
    handle: '@handle@kos.mo',
    meta: '',
    bio: '',
    width: 'compact',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    <UserRow state="follow" />
    <UserRow state="following" />
    <UserRow state="follow" width="wide" handle="@user@kos.moe" meta="#그림 #팬아트" />
    <UserRow
      state="following"
      width="wide"
      handle="@user@kos.moe"
      bio="한 줄 소개가 들어가는 자리"
    />
  </div>
</Story>
