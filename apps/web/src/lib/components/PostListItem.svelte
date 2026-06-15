<script lang="ts">
  import { formatTimelineTimestamp } from '@kosmo/core/datetime';
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import { tick } from 'svelte';
  import { Temporal } from 'temporal-polyfill';
  import type { HTMLAttributes } from 'svelte/elements';

  import type { PostListItem_post$key } from '$mearie';

  import PostAuthorProfile from './PostAuthorProfile.svelte';

  // 게시글 목록 항목(Figma PostCard 67:206). 디테일(`PostBody`)과 달리 목록 표현을
  // 따른다: 시간은 헤더 우측(24시간 미만 상대시간, 이상 날짜), 본문은 클램프.
  // 카드 전체는 디테일로 이동하고, 카드 내부 컨트롤은 pointer-events-auto로
  // overlay 링크보다 우선한다.
  type Props = HTMLAttributes<HTMLElement> & {
    post: PostListItem_post$key;
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
          handle
          ...PostAuthorProfile_profile
        }
      }
    `),
    () => post,
  );

  // Figma TimeInfo(67:245) variant를 따른다: 24시간 미만은 상대시간, 이상은 날짜.
  // 포맷 규칙은 @kosmo/core/datetime에서 정한다.
  const formattedCreatedAt = $derived(
    formatTimelineTimestamp(Temporal.Instant.from(postFragment.data.createdAt as string)),
  );
  const detailHref = $derived(`/@${postFragment.data.profile.handle}/${postFragment.data.id}`);

  // 본문 미리보기와 "더보기..."(Figma ExpandButton 67:515) 인라인 펼침. 펼친 뒤
  // 다시 접는 동작은 Figma에 없어 두지 않는다.
  // 잘림 기준은 렌더 측정 없이 본문 텍스트로 판정한다: 200자 초과 또는 줄바꿈 10줄
  // 초과 중 하나라도 해당하면 자른다(글자 수 기준은 팀 결정값, Figma에 명시 없음).
  // 줄 상한은 글자 수는 적어도 줄바꿈이 많은 본문이 목록을 길게 차지하지 않게 한다.
  const BODY_PREVIEW_MAX_CHARS = 200;
  const BODY_PREVIEW_MAX_LINES = 10;

  let expanded = $state(false);
  let bodyElement = $state<HTMLParagraphElement>();

  const fullBody = $derived(postFragment.data.content?.bodyText ?? '');
  const previewBody = $derived.by(() => {
    const preview = fullBody.split('\n').slice(0, BODY_PREVIEW_MAX_LINES).join('\n');
    // surrogate pair(이모지 등)를 자르지 않도록 코드 포인트 단위로 센다.
    const characters = [...preview];
    if (characters.length <= BODY_PREVIEW_MAX_CHARS) {
      return preview;
    }
    return characters.slice(0, BODY_PREVIEW_MAX_CHARS).join('');
  });
  // 잘려나간 부분이 공백뿐이면(예: 꼬리 줄바꿈) 펼쳐도 차이가 없으므로 자르지 않는다.
  const clamped = $derived(fullBody.slice(previewBody.length).trim() !== '');

  // 더보기 버튼은 펼치면 DOM에서 사라지므로, 포커스가 document로 떨어지지 않게
  // 펼쳐진 본문으로 옮긴다.
  const expand = async () => {
    expanded = true;
    await tick();
    bodyElement?.focus();
  };
</script>

<article
  {...attributes}
  class={`border-border relative border-b px-2 pt-2 pb-4 ${className ?? ''}`}
>
  <a
    class="focus-visible:outline-more absolute inset-0 z-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
    href={detailHref}
  >
    <span class="sr-only">@{postFragment.data.profile.handle}의 게시글 상세 보기</span>
  </a>

  <div class="pointer-events-none relative z-10">
    <PostAuthorProfile avatarSize="lg" profile={postFragment.data.profile}>
      {#snippet trailing()}
        <time class="text-text-secondary text-sm" datetime={postFragment.data.createdAt as string}>
          {formattedCreatedAt}
        </time>
      {/snippet}

      {#if fullBody}
        <!-- tabindex는 펼침 시 -1로만 설정되는 programmatic focus 대상이다(탭 순서에
             들어가지 않음). 정적 분석이 동적 값을 음수로 판별하지 못해 경고를 끈다. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <p
          bind:this={bodyElement}
          class="text-text-primary text-md focus-visible:outline-more mt-2 rounded-md break-words whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-offset-2"
          tabindex={expanded ? -1 : undefined}
        >
          {#if expanded || !clamped}{fullBody}{:else}{previewBody}…{/if}
        </p>
        {#if clamped && !expanded}
          <button
            class="text-more text-md focus-visible:outline-more pointer-events-auto block rounded-md text-left font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            onclick={expand}
            type="button"
          >
            더보기...
          </button>
        {/if}
      {/if}
    </PostAuthorProfile>
  </div>
</article>
