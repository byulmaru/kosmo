<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  // 게시글 본문(Plain Text)과 작성 시각·공개 범위 메타라인을 표시하는 프래그먼트 컴포넌트.
  // 작성자 영역은 별도 `PostAuthorProfile`이 담당하므로 여기에는 포함하지 않는다.
  type Props = HTMLAttributes<HTMLDivElement> & {
    post: FragmentRefs<'PostBody_post'>;
  };

  let { post, class: className, ...attributes }: Props = $props();

  const postFragment = createFragment(
    graphql(`
      fragment PostBody_post on Post {
        content {
          bodyText
        }
        createdAt
        visibility
      }
    `),
    () => post,
  );

  // PostVisibility는 PUBLIC/UNLISTED/FOLLOWERS/DIRECT 4종이다.
  const visibilityLabel: Record<string, string> = {
    PUBLIC: '전체 공개',
    UNLISTED: '조용히 공개',
    FOLLOWERS: '팔로워 공개',
    DIRECT: '다이렉트',
  };

  const dateFormatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' });
  const formattedCreatedAt = $derived(
    dateFormatter.format(new Date(postFragment.data.createdAt as string)),
  );
</script>

<div {...attributes} class={className}>
  {#if postFragment.data.content}
    <p class="text-text-primary text-[17px] break-words whitespace-pre-wrap">
      {postFragment.data.content.bodyText}
    </p>
  {/if}

  <div class="text-text-secondary mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
    <time datetime={postFragment.data.createdAt as string}>{formattedCreatedAt}</time>
    <span aria-hidden="true">·</span>
    <span>{visibilityLabel[postFragment.data.visibility]}</span>
  </div>
</div>
