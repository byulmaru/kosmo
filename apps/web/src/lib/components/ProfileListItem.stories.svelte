<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import ProfileListItem from './ProfileListItem.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/ProfileListItem',
    component: ProfileListItem,
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
    bio: '',
    width: 'compact',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    <ProfileListItem state="follow" />
    <ProfileListItem state="following" />
    <ProfileListItem state="follow" width="wide" handle="@user@kos.moe" />
    <ProfileListItem
      state="following"
      width="wide"
      handle="@user@kos.moe"
      bio="한 줄 소개가 들어가는 자리"
    />
  </div>
</Story>

<Story name="Edge cases" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-3">
    <ProfileListItem
      state="follow"
      width="wide"
      name="아주 긴 표시 이름이 들어가서 한 줄을 넘기면 잘려야 한다"
      handle="@super-long-handle-that-overflows@really-long-instance.example.com"
      bio="긴 한 줄 소개가 들어가서 컨테이너 폭을 넘기면 말줄임으로 잘려야 한다"
    />
    <ProfileListItem state="follow" name="최소 정보" handle="@user@kos.moe" />
  </div>
</Story>
