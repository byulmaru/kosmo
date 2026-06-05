<script lang="ts">
  import { createFragment, createMutation } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import type { DataOf, FragmentRefs } from '@mearie/svelte';

  import Button from './Button.svelte';

  const followButtonProfileFragment = graphql(`
    fragment FollowButton_profile on Profile {
      id
      viewerFollow {
        id
        state
      }
    }
  `);

  type ViewerFollow = NonNullable<DataOf<typeof followButtonProfileFragment>['viewerFollow']>;

  type Props = {
    profile: FragmentRefs<'FollowButton_profile'>;
    viewerProfileId?: string | null;
    authenticated?: boolean;
    canMutate?: boolean;
    disabledReason?: string | null;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
    onFollowChange?: (viewerFollow: ViewerFollow | null) => void;
  };

  const followProfileMutation = graphql(`
    mutation FollowButtonFollowProfile($id: ID!) {
      followProfile(input: { id: $id }) {
        __typename
        ... on FollowProfileSuccess {
          profileFollow {
            id
            state
          }
        }
        ... on Error {
          message
        }
      }
    }
  `);

  const unfollowProfileMutation = graphql(`
    mutation FollowButtonUnfollowProfile($id: ID!) {
      unfollowProfile(input: { id: $id }) {
        __typename
        ... on UnfollowProfileSuccess {
          profileFollowId
        }
        ... on Error {
          message
        }
      }
    }
  `);

  let {
    profile,
    viewerProfileId = null,
    authenticated = true,
    canMutate = true,
    disabledReason = null,
    size = 'sm',
    class: className = '',
    onFollowChange,
  }: Props = $props();

  const [followProfile] = createMutation(followProfileMutation);
  const [unfollowProfile] = createMutation(unfollowProfileMutation);
  const profileFragment = createFragment(followButtonProfileFragment, () => profile);

  let overrideProfileId = $state<string | null>(null);
  let followOverride = $state<ViewerFollow | null>(null);
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);

  const getTargetProfileId = () => profileFragment.data.id;
  const getViewerFollow = () =>
    overrideProfileId === getTargetProfileId() ? followOverride : profileFragment.data.viewerFollow;
  const isFollowing = () => getViewerFollow()?.state === 'ACCEPTED';
  // TODO: 승인 플로우가 추가되면 PENDING/REJECTED 전이를 실제 mutation 결과로 검증한다.
  const isPending = () => getViewerFollow()?.state === 'PENDING';
  const isSelf = () => Boolean(viewerProfileId && viewerProfileId === getTargetProfileId());
  const getUnavailableReason = () =>
    disabledReason ??
    (!authenticated
      ? '로그인 후 팔로우할 수 있습니다.'
      : !viewerProfileId
        ? '프로필을 선택한 뒤 팔로우할 수 있습니다.'
        : !canMutate
          ? '이 프로필을 팔로우할 권한이 없습니다.'
          : null);
  const getDisabled = () => loading || Boolean(getUnavailableReason());
  const getLabel = () =>
    loading ? '처리 중' : isPending() ? '요청 중' : isFollowing() ? '팔로잉' : '팔로우';
  const getVariant = () => (isFollowing() || isPending() ? 'secondary' : 'primary');
  const getMessage = () => errorMessage ?? getUnavailableReason();

  const setFollow = (nextFollow: ViewerFollow | null) => {
    overrideProfileId = getTargetProfileId();
    followOverride = nextFollow;
    onFollowChange?.(nextFollow);
  };

  const followAction = async (id: string) => {
    const data = await followProfile({ id });
    if (data.followProfile.__typename !== 'FollowProfileSuccess') {
      throw new Error('팔로우 상태를 변경하지 못했습니다.');
    }

    return data.followProfile.profileFollow;
  };

  const unfollowAction = async (id: string) => {
    const data = await unfollowProfile({ id });
    if (data.unfollowProfile.__typename !== 'UnfollowProfileSuccess') {
      throw new Error('팔로우 상태를 변경하지 못했습니다.');
    }
  };

  const toggleFollow = async () => {
    if (getDisabled()) {
      return;
    }

    const targetProfileId = getTargetProfileId();

    loading = true;
    errorMessage = null;

    try {
      if (isFollowing() || isPending()) {
        await unfollowAction(targetProfileId);
        setFollow(null);
        return;
      }

      setFollow(await followAction(targetProfileId));
    } catch {
      errorMessage = '팔로우 상태를 변경하지 못했습니다.';
    } finally {
      loading = false;
    }
  };
</script>

{#if !isSelf()}
  <div class={`inline-flex flex-col items-start gap-1 ${className}`}>
    <Button
      variant={getVariant()}
      {size}
      disabled={getDisabled()}
      aria-busy={loading}
      aria-pressed={isFollowing()}
      onclick={toggleFollow}
    >
      {getLabel()}
    </Button>
    {#if getMessage()}
      <p
        class="text-text-secondary m-0 max-w-56 text-xs leading-4"
        role={errorMessage ? 'alert' : undefined}
      >
        {getMessage()}
      </p>
    {/if}
  </div>
{/if}
