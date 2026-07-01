<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import type { FollowButton_profile$key } from '$mearie';

  import FollowButton from './FollowButton.svelte';

  type FollowState = 'ACCEPTED' | 'PENDING' | 'REJECTED';
  type ViewerState = {
    authenticated: boolean;
    hasSelectedProfile: boolean;
    isSelf: boolean;
    canMutate: boolean;
    follow: { id: string; state: FollowState } | null;
  };

  const targetProfileId = 'target-profile';
  const defaultViewerState = (overrides: Partial<ViewerState> = {}): ViewerState => ({
    authenticated: true,
    hasSelectedProfile: true,
    isSelf: false,
    canMutate: true,
    follow: null,
    ...overrides,
  });

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const profile = (
    id: string,
    viewerState: ViewerState = defaultViewerState(),
  ): FollowButton_profile$key =>
    ({
      __typename: 'Profile',
      id,
      viewerState,
    }) as unknown as FollowButton_profile$key;

  const { Story } = defineMeta({
    title: 'KOSMO/FollowButton',
    component: FollowButton,
    tags: ['autodocs'],
    argTypes: {
      size: {
        control: 'radio',
        options: ['sm', 'md', 'lg'],
      },
    },
  });
</script>

<Story
  name="Playground"
  args={{
    profile: profile(targetProfileId),
    size: 'sm',
  }}
/>

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid gap-4 text-sm">
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">팔로우 가능</p>
      <FollowButton profile={profile('followable-profile')} />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">팔로잉</p>
      <FollowButton
        profile={profile(
          'followed-profile',
          defaultViewerState({ follow: { id: 'follow-accepted', state: 'ACCEPTED' } }),
        )}
      />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">요청 중</p>
      <FollowButton
        profile={profile(
          'pending-profile',
          defaultViewerState({ follow: { id: 'follow-pending', state: 'PENDING' } }),
        )}
      />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">거절 후 재요청 가능</p>
      <FollowButton
        profile={profile(
          'rejected-profile',
          defaultViewerState({ follow: { id: 'follow-rejected', state: 'REJECTED' } }),
        )}
      />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">프로필 미선택</p>
      <FollowButton
        profile={profile(
          'missing-viewer-profile',
          defaultViewerState({ hasSelectedProfile: false, canMutate: false }),
        )}
      />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">비로그인</p>
      <FollowButton
        profile={profile(
          'guest-profile',
          defaultViewerState({
            authenticated: false,
            hasSelectedProfile: false,
            canMutate: false,
          }),
        )}
      />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">권한 없음</p>
      <FollowButton
        profile={profile('blocked-profile', defaultViewerState({ canMutate: false }))}
      />
    </section>
    <section class="grid gap-1">
      <p class="text-text-secondary m-0">본인 프로필에서는 버튼이 렌더링되지 않음</p>
      <FollowButton
        profile={profile('self-profile', defaultViewerState({ isSelf: true, canMutate: false }))}
      />
    </section>
  </div>
</Story>
