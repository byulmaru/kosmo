<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  import type { PostList_profile$key } from '$mearie';

  import PostListItem from './PostListItem.svelte';
  import TextSkeleton from './TextSkeleton.svelte';

  // 프로필 게시글 목록(PROD-124). Pagination UI는 별도 이슈로 분리하고 첫 페이지만
  // 조회한다. 항목 본문은 TipTap 렌더러 대신 PostListItem의 plain text fragment를 사용한다.
  type Props = HTMLAttributes<HTMLElement> & {
    profile?: PostList_profile$key | null;
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  };

  let {
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

  const postEdges = $derived(profileFragment.data?.posts.edges ?? []);

  // 첫 화면을 채울 만큼만 반복한다.
  const skeletonItems = [0, 1, 2];
</script>

<section {...attributes} class={className}>
  {#if loading && !profileFragment.data}
    <div aria-hidden="true">
      {#each skeletonItems as item (item)}
        <div class="flex items-start gap-3 px-2 pt-2 pb-4">
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
  {:else if error && !profileFragment.data}
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
