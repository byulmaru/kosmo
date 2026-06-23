<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import ProfileConnectionList from './ProfileConnectionList.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/ProfileConnectionList',
    component: ProfileConnectionList,
    tags: ['autodocs'],
    argTypes: {
      kind: {
        control: 'radio',
        options: ['followers', 'following'],
      },
    },
  });
</script>

<Story name="Playground" args={{ kind: 'followers', loading: false, error: false }} />

<!-- 팔로워 목록 영역의 상태 전체: 로딩, 오류, 빈 상태. 항목 목록은 PROD-184/185에서 연결한다. -->
<Story name="Followers states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <ProfileConnectionList kind="followers" loading />
    <ProfileConnectionList kind="followers" error onRetry={() => {}} />
    <ProfileConnectionList kind="followers" />
  </div>
</Story>

<!-- 팔로잉 목록 영역의 상태 전체: 로딩, 오류, 빈 상태. 팔로워와 같은 구조를 공유한다. -->
<Story name="Following states" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <ProfileConnectionList kind="following" loading />
    <ProfileConnectionList kind="following" error onRetry={() => {}} />
    <ProfileConnectionList kind="following" />
  </div>
</Story>
