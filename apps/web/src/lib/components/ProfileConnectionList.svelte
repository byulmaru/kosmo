<script lang="ts">
  import { createFragment } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import type { HTMLAttributes } from 'svelte/elements';

  import type {
    ProfileConnectionList_followersProfile$key,
    ProfileConnectionList_followingProfile$key,
  } from '$mearie';

  import ProfileListItem from './ProfileListItem.svelte';
  import TextSkeleton from './TextSkeleton.svelte';

  // 프로필 팔로워/팔로잉 목록 영역. 게시글 목록(PostList)과 같은 상태(로딩/오류/빈) 표현·접근성 패턴을 따른다.
  // 팔로워/팔로잉은 같은 컴포넌트를 `kind`로 분기해 시각/상태 구조를 일치시킨다.
  // Pagination UI는 별도 이슈로 분리하고 첫 페이지만 조회한다.
  type ConnectionKind = 'followers' | 'following';

  type Props = HTMLAttributes<HTMLElement> & {
    kind: ConnectionKind;
    followersProfile?: ProfileConnectionList_followersProfile$key | null;
    followingProfile?: ProfileConnectionList_followingProfile$key | null;
    viewerProfileId?: string | null;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  };

  let {
    kind,
    followersProfile = null,
    followingProfile = null,
    viewerProfileId = null,
    loading = false,
    error = false,
    onRetry,
    class: className,
    ...attributes
  }: Props = $props();

  // 목록 종류별 표시 문구를 컴포넌트 안에 모아 두 라우트가 같은 카피를 공유하게 한다.
  const copy: Record<
    ConnectionKind,
    {
      title: string;
      emptyTitle: string;
      emptyDescription: string;
      errorTitle: string;
      loadingLabel: string;
    }
  > = {
    followers: {
      title: '팔로워',
      emptyTitle: '아직 팔로워가 없어요',
      emptyDescription: '이 프로필을 팔로우하는 사람이 생기면 여기에 표시돼요.',
      errorTitle: '팔로워 목록을 불러오지 못했어요',
      loadingLabel: '팔로워 목록을 불러오는 중입니다.',
    },
    following: {
      title: '팔로잉',
      emptyTitle: '아직 팔로잉이 없어요',
      emptyDescription: '이 프로필이 팔로우하는 사람이 생기면 여기에 표시돼요.',
      errorTitle: '팔로잉 목록을 불러오지 못했어요',
      loadingLabel: '팔로잉 목록을 불러오는 중입니다.',
    },
  };

  const text = $derived(copy[kind]);

  const followersFragment = createFragment(
    graphql(`
      fragment ProfileConnectionList_followersProfile on Profile {
        id
        followers(first: 20) {
          edges {
            cursor
            node {
              id
              follower {
                id
                ...ProfileListItem_profile
              }
            }
          }
        }
      }
    `),
    () => followersProfile,
  );

  const followingFragment = createFragment(
    graphql(`
      fragment ProfileConnectionList_followingProfile on Profile {
        id
        following(first: 20) {
          edges {
            cursor
            node {
              id
              followee {
                id
                ...ProfileListItem_profile
              }
            }
          }
        }
      }
    `),
    () => followingProfile,
  );

  const getConnectionProfiles = () => {
    if (kind === 'followers') {
      return (
        followersFragment.data?.followers.edges.flatMap((edge) =>
          edge.node.follower ? [{ cursor: edge.cursor, profile: edge.node.follower }] : [],
        ) ?? []
      );
    }

    return (
      followingFragment.data?.following.edges.flatMap((edge) =>
        edge.node.followee ? [{ cursor: edge.cursor, profile: edge.node.followee }] : [],
      ) ?? []
    );
  };

  const connectionProfiles = $derived(getConnectionProfiles());
  const hasConnectionData = $derived(
    kind === 'followers' ? Boolean(followersFragment.data) : Boolean(followingFragment.data),
  );

  // 첫 화면을 채울 만큼만 반복한다.
  const skeletonItems = [0, 1, 2];
</script>

<section {...attributes} class={className}>
  <h2 class="text-text-primary border-border border-b px-4 pt-2 pb-3 text-base font-bold">
    {text.title}
  </h2>
  {#if loading && !hasConnectionData}
    <div aria-hidden="true">
      {#each skeletonItems as item (item)}
        <div class="border-border flex items-center gap-3 border-b px-4 py-3">
          <div
            class="border-border bg-surface size-10 shrink-0 animate-pulse rounded-full border"
          ></div>
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <TextSkeleton width="md" />
            <TextSkeleton width="sm" />
          </div>
        </div>
      {/each}
    </div>
    <span class="sr-only" role="status">{text.loadingLabel}</span>
  {:else if error && !hasConnectionData}
    <div class="px-4 py-12 text-center" role="alert">
      <p class="text-text-primary text-base font-semibold">{text.errorTitle}</p>
      <p class="text-text-secondary mt-1 text-sm">잠시 후 다시 시도해주세요.</p>
      {#if onRetry}
        <button
          class="border-border text-text-primary mt-4 rounded-lg border px-4 py-2 text-sm font-bold"
          type="button"
          onclick={onRetry}
        >
          다시 시도
        </button>
      {/if}
    </div>
  {:else if connectionProfiles.length > 0}
    <div>
      {#each connectionProfiles as item (item.cursor)}
        <ProfileListItem
          profile={item.profile}
          linked
          {viewerProfileId}
          width="wide"
          class="w-full"
        />
      {/each}
    </div>
  {:else}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">{text.emptyTitle}</p>
      <p class="text-text-secondary mt-1 text-sm">{text.emptyDescription}</p>
    </div>
  {/if}
</section>
