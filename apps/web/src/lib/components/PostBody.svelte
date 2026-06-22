<script lang="ts">
  import type { TipTapDocument } from '@kosmo/core/tiptap';
  import { graphql } from '$mearie';
  import type { PostBody_post$key } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  import TipTapRenderer from './TipTapRenderer.svelte';

  // 게시글 본문(TipTap 문서)을 리치 렌더하는 프래그먼트 컴포넌트.
  // 작성자 영역·작성 시각·공개 범위 같은 정보는 PostLayout(상세)·PostListItem(목록)이
  // 담당하므로 여기에는 포함하지 않는다. 본문은 feed·detail 양쪽에서 이 컴포넌트로 통일한다.
  type Props = HTMLAttributes<HTMLDivElement> & {
    post: PostBody_post$key;
  };

  let { post, class: className, ...attributes }: Props = $props();

  const postFragment = createFragment(
    graphql(`
      fragment PostBody_post on Post {
        id
        content {
          id
          bodyJson
          bodyText
        }
      }
    `),
    () => post,
  );

  // 본문 TipTap 문서. content가 없거나 plain text projection이 비어 있으면 렌더하지 않는다.
  const document = $derived.by<TipTapDocument | null>(() => {
    const content = postFragment.data.content;
    if (!content || !content.bodyText) {
      return null;
    }

    // 서버가 write 시점에 정규화·검증한 문서이므로 read 시점에 재검증하지 않는다.
    // 스키마 버전 불일치로 검증이 실패해도 본문이 통째로 사라지지 않도록 그대로 전달한다.
    return content.bodyJson as TipTapDocument;
  });
</script>

{#if document}
  <TipTapRenderer {...attributes} class={className} {document} />
{/if}
