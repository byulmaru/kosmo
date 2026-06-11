<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { Temporal } from 'temporal-polyfill';

  // 게시글 본문(Plain Text)과 작성 시각·공개 범위 메타라인을 표시하는 프래그먼트 컴포넌트.
  // 작성자 영역은 별도 `PostAuthorProfile`이 담당하므로 여기에는 포함하지 않는다.
  type Props = HTMLAttributes<HTMLDivElement> & {
    post: FragmentRefs<'PostBody_post'>;
  };

  let { post, class: className, ...attributes }: Props = $props();

  const postFragment = createFragment(
    graphql(`
      fragment PostBody_post on Post {
        id
        content {
          id
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

  // Figma 메타라인 형식(오후 9:14 · 2026. 04. 27)을 따른다. ko-KR 날짜 출력의
  // 마지막 마침표는 Figma 표기에 없으므로 제거한다.
  const formattedCreatedAt = $derived.by(() => {
    const createdAt = Temporal.Instant.from(postFragment.data.createdAt as string);
    const time = createdAt.toLocaleString('ko-KR', { timeStyle: 'short' });
    const date = createdAt.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return `${time} · ${date.replace(/\.$/, '')}`;
  });
</script>

<div {...attributes} class={className}>
  {#if postFragment.data.content}
    <p class="text-text-primary text-md break-words whitespace-pre-wrap">
      {postFragment.data.content.bodyText}
    </p>
  {/if}

  <div
    class="text-text-secondary text-xsm mt-1.5 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 lg:text-sm"
  >
    <time datetime={postFragment.data.createdAt as string}>{formattedCreatedAt}</time>
    <span aria-hidden="true">·</span>
    <span>{visibilityLabel[postFragment.data.visibility]}</span>
  </div>
</div>
