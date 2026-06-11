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

  // 본문 클램프(Figma PostText 67:527 — 예시 기준 4줄)와 "더보기..."(ExpandButton
  // 67:515) 인라인 펼침. 디테일 이동 링크는 별도 서브이슈 범위라 페이지 이동 없이
  // 제자리에서 펼친다. 펼친 뒤 다시 접는 동작은 Figma에 없어 두지 않는다.
  let bodyElement = $state<HTMLParagraphElement>();
  let expanded = $state(false);
  let clamped = $state(false);

  // 잘림 여부는 클램프된 요소의 scrollHeight가 보이는 높이를 넘는지로 감지한다.
  // SSR에서는 측정할 수 없어 마운트 후 버튼이 나타나고, 폭 변화(리사이즈)에도
  // 재평가한다.
  $effect(() => {
    const element = bodyElement;
    // 본문이 바뀌면(높이 변화 없이도) 다시 측정해야 하므로 의존성으로 읽는다.
    const bodyText = postFragment.data.content?.bodyText;
    if (!element || !bodyText || expanded) {
      clamped = false;
      return;
    }

    const measure = () => {
      clamped = element.scrollHeight > element.clientHeight;
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
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
      <p
        bind:this={bodyElement}
        class={`text-text-primary text-md mt-2 break-words whitespace-pre-wrap ${expanded ? '' : 'line-clamp-4'}`}
      >
        {postFragment.data.content.bodyText}
      </p>
      {#if clamped}
        <button
          class="text-more text-md focus-visible:outline-more block rounded-md text-left font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          onclick={() => (expanded = true)}
          type="button"
        >
          더보기...
        </button>
      {/if}
    {/if}
  </PostAuthorProfile>
</article>
