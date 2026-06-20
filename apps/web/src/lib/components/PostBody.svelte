<script lang="ts">
  import { tipTapDocumentSchema } from '@kosmo/core/tiptap';
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

    const parsedDocument = tipTapDocumentSchema.safeParse(content.bodyJson);
    return parsedDocument.success ? parsedDocument.data : null;
  });
</script>

{#if document}
  <TipTapRenderer {...attributes} class={className} {document} />
{/if}
