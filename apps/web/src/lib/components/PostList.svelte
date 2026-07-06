<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  import type {
    PostList_homeTimeline$key,
    PostList_profile$key,
    PostListItem_post$key,
  } from '$mearie';

  import PostListItem from './PostListItem.svelte';
  import TextSkeleton from './TextSkeleton.svelte';

  // 프로필 게시글 목록과 홈 타임라인은 같은 Post connection 항목 표현을 쓴다.
  // Pagination UI는 별도 이슈로 분리하고 첫 페이지만 조회한다.
  // 항목 본문은 PostListItem의 TipTap 렌더러 fragment를 통해 렌더한다.
  type HomeTimeline = PostList_homeTimeline$key & {
    edges?: readonly { cursor: string; node: { id: string } & PostListItem_post$key }[];
  };

  type Props = HTMLAttributes<HTMLElement> & {
    homeTimeline?: HomeTimeline | null;
    profile?: PostList_profile$key | null;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  };

  let {
    homeTimeline = null,
    profile = null,
    loading = false,
    error = false,
    onRetry,
    class: className,
    ...attributes
  }: Props = $props();

  const profileFragment = createFragment(
    graphql(`
      fragment PostList_profile on Profile {
        id
        posts(first: 20) {
          edges {
            cursor
            node {
              id
              ...PostListItem_post
            }
          }
        }
      }
    `),
    () => profile,
  );

  const homeTimelineFragment = createFragment(
    graphql(`
      fragment PostList_homeTimeline on PostConnection {
        edges {
          cursor
          node {
            id
            ...PostListItem_post
          }
        }
      }
    `),
    () => homeTimeline,
  );

  const homeTimelineEdges = $derived(homeTimeline?.edges);
  const postEdges = $derived(
    homeTimelineEdges ??
      homeTimelineFragment.data?.edges ??
      profileFragment.data?.posts.edges ??
      [],
  );
  const hasPostData = $derived(
    Boolean(homeTimelineEdges || homeTimelineFragment.data || profileFragment.data),
  );

  // 첫 화면을 채울 만큼만 반복한다.
  const skeletonItems = [0, 1, 2];
</script>

<section {...attributes} class={className}>
  {#if loading && !hasPostData}
    <div aria-hidden="true">
      {#each skeletonItems as item (item)}
        <div class="border-border flex items-start gap-3 border-b px-2 pt-2 pb-4">
          <div class="w-12 shrink-0">
            <div class="border-border bg-surface size-12 animate-pulse rounded-full border"></div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-col gap-2">
              <TextSkeleton width="md" />
              <TextSkeleton width="sm" />
            </div>
            <!-- 실제 게시글(이름 블록 아래 본문이 컬럼 폭으로 흐르는 형태)에 가깝도록
                 본문 줄은 컨테이너 폭을 가득 채운다. -->
            <div class="mt-3 flex flex-col gap-2.5">
              <TextSkeleton width="stretch" />
              <TextSkeleton width="stretch" />
              <TextSkeleton width="lg" />
            </div>
          </div>
        </div>
      {/each}
    </div>
    <span class="sr-only" role="status">게시글 목록을 불러오는 중입니다.</span>
  {:else if error && !hasPostData}
    <div class="px-4 py-12 text-center" role="alert">
      <p class="text-text-primary text-base font-semibold">게시글 목록을 불러오지 못했어요</p>
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
  {:else if postEdges.length > 0}
    <div>
      {#each postEdges as edge (edge.cursor)}
        <PostListItem post={edge.node} />
      {/each}
    </div>
  {:else}
    <div class="px-4 py-12 text-center">
      <p class="text-text-primary text-base font-semibold">아직 게시글이 없어요</p>
      <p class="text-text-secondary mt-1 text-sm">첫 게시글이 올라오면 여기에 표시돼요.</p>
    </div>
  {/if}
</section>
