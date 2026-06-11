<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { Temporal } from 'temporal-polyfill';

  import PostAuthorProfile from './PostAuthorProfile.svelte';

  // 게시글 목록 항목(Figma PostCard 67:206). 디테일(`PostBody`)과 달리 목록 표현을
  // 따른다: 시간은 헤더 우측(24시간 미만 상대시간, 이상 날짜), 본문은 클램프.
  // 디테일 이동 링크·액션바·이미지는 별도 서브이슈 범위라 포함하지 않는다.
  type Props = HTMLAttributes<HTMLElement> & {
    post: FragmentRefs<'PostListItem_post'>;
  };

  let { post, class: className, ...attributes }: Props = $props();

  const postFragment = createFragment(
    graphql(`
      fragment PostListItem_post on Post {
        id
        content {
          id
          bodyText
        }
        createdAt
        profile {
          id
          ...PostAuthorProfile_profile
        }
      }
    `),
    () => post,
  );

  // Figma TimeInfo(67:245) variant를 따른다: 24시간 미만은 상대시간("방금 전"/
  // "n분 전"/"n시간 전"), 이상은 날짜("2026. 04. 27" — ko-KR 출력의 끝 마침표는
  // Figma 표기에 없으므로 제거, PostBody와 같은 처리).
  const formattedCreatedAt = $derived.by(() => {
    const createdAt = Temporal.Instant.from(postFragment.data.createdAt as string);
    const elapsedSeconds =
      (Temporal.Now.instant().epochMilliseconds - createdAt.epochMilliseconds) / 1000;

    if (elapsedSeconds < 60) {
      return '방금 전';
    }
    if (elapsedSeconds < 3600) {
      return `${Math.floor(elapsedSeconds / 60)}분 전`;
    }
    if (elapsedSeconds < 86_400) {
      return `${Math.floor(elapsedSeconds / 3600)}시간 전`;
    }

    const date = createdAt.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return date.replace(/\.$/, '');
  });
</script>

<article {...attributes} class={`border-border border-b px-2 pt-2 pb-4 ${className ?? ''}`}>
  <PostAuthorProfile avatarSize="lg" profile={postFragment.data.profile}>
    {#snippet trailing()}
      <time class="text-text-secondary text-sm" datetime={postFragment.data.createdAt as string}>
        {formattedCreatedAt}
      </time>
    {/snippet}

    {#if postFragment.data.content}
      <p class="text-text-primary text-md mt-2 break-words whitespace-pre-wrap">
        {postFragment.data.content.bodyText}
      </p>
    {/if}
  </PostAuthorProfile>
</article>
