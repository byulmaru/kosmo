<script lang="ts">
  import { formatTimelineTimestamp } from '@kosmo/core/datetime';
  import { tipTapDocumentSchema } from '@kosmo/core/tiptap';
  import type { TipTapDocument } from '@kosmo/core/tiptap';
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { Temporal } from 'temporal-polyfill';

  import type { PostListItem_post$key } from '$mearie';

  import PostLayout from './PostLayout.svelte';
  import TipTapRenderer from './TipTapRenderer.svelte';

  // 게시글 목록 항목(Figma PostCard 67:206). 디테일(`PostBody`)과 달리 목록 표현을
  // 따른다: 시간은 헤더 우측(24시간 미만 상대시간, 이상 날짜), 본문은 TipTap 원본
  // 문서 그대로 렌더한다.
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
          bodyJson
          bodyText
        }
        createdAt
        profile {
          id
          handle
          ...PostLayout_profile
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

  const fullBody = $derived(postFragment.data.content?.bodyText ?? '');
  const fullDocument = $derived.by<TipTapDocument | null>(() => {
    const content = postFragment.data.content;
    if (!content) {
      return null;
    }

    const parsedDocument = tipTapDocumentSchema.safeParse(content.bodyJson);
    if (parsedDocument.success) {
      return parsedDocument.data;
    }

    return null;
  });
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
    <PostLayout avatarSize="lg" profile={postFragment.data.profile}>
      {#snippet trailing()}
        <time class="text-text-secondary text-sm" datetime={postFragment.data.createdAt as string}>
          {formattedCreatedAt}
        </time>
      {/snippet}

      {#if fullDocument && fullBody}
        <div>
          <TipTapRenderer document={fullDocument} />
        </div>
      {/if}
    </PostLayout>
  </div>
</article>
