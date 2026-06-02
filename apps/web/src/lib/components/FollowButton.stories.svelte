<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import FollowButtonView from './FollowButtonView.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/FollowButton',
    component: FollowButtonView,
    tags: ['autodocs'],
    argTypes: {
      authenticated: {
        control: 'boolean',
      },
      canMutate: {
        control: 'boolean',
      },
      size: {
        control: 'radio',
        options: ['sm', 'md', 'lg'],
      },
    },
  });
</script>

<script lang="ts">
  const targetProfileId = '00000000-0000-4000-8000-000000000090';
  const viewerProfileId = '00000000-0000-4000-8000-000000000001';
  const acceptedFollow = {
    id: '00000000-0000-4000-8000-000000000100',
    state: 'ACCEPTED' as const,
  };
  const pendingFollow = {
    id: '00000000-0000-4000-8000-000000000101',
    state: 'PENDING' as const,
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const followAction = async () => {
    await wait(400);
    return acceptedFollow;
  };
  const unfollowAction = async () => {
    await wait(400);
  };
  const failingFollowAction = async () => {
    await wait(400);
    throw new Error('팔로우 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
  };
</script>

<Story
  name="Playground"
  args={{
    targetProfileId,
    viewerProfileId,
    viewerFollow: null,
    authenticated: true,
    canMutate: true,
    size: 'sm',
    followAction,
    unfollowAction,
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4">
    <FollowButtonView {targetProfileId} {viewerProfileId} {followAction} {unfollowAction} />
    <FollowButtonView
      {targetProfileId}
      {viewerProfileId}
      viewerFollow={acceptedFollow}
      {followAction}
      {unfollowAction}
    />
    <FollowButtonView
      {targetProfileId}
      {viewerProfileId}
      viewerFollow={pendingFollow}
      {followAction}
      {unfollowAction}
    />
    <FollowButtonView {targetProfileId} viewerProfileId={null} {followAction} {unfollowAction} />
    <FollowButtonView
      {targetProfileId}
      {viewerProfileId}
      authenticated={false}
      {followAction}
      {unfollowAction}
    />
    <FollowButtonView
      {targetProfileId}
      {viewerProfileId}
      canMutate={false}
      {followAction}
      {unfollowAction}
    />
    <FollowButtonView
      {targetProfileId}
      {viewerProfileId}
      followAction={failingFollowAction}
      {unfollowAction}
    />
  </div>
</Story>
