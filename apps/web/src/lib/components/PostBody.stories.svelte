<script module lang="ts">
  import { createTipTapDocumentFromPlainText } from '@kosmo/core/tiptap';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostBody from './PostBody.svelte';

  import type { PostBody_post$key } from '$mearie';

  import { makePost, postBodyCases } from '$lib/stories/postFixtures';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const post = (bodyText: string | null): PostBody_post$key =>
    ({
      __typename: 'Post',
      id: 'story-post',
      content:
        bodyText === null
          ? null
          : {
              __typename: 'PostContent',
              id: 'story-post-content',
              bodyJson: createTipTapDocumentFromPlainText(bodyText),
              bodyText,
            },
    }) as unknown as PostBody_post$key;

  const { Story } = defineMeta({
    title: 'KOSMO/PostBody',
    component: PostBody,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Playground"
  args={{ post: post('본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어납니다.') }}
/>

<!-- 본문 상태: 짧은 본문, 여러 문단(줄바꿈·빈 줄 보존), 빈 본문(렌더 안 함). -->
<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <PostBody post={post('짧은 본문 한 줄.')} />
    <PostBody
      post={post(
        '본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어납니다.\n줄바꿈도 그대로 보존됩니다.\n\n문단 사이 빈 줄도 유지됩니다.',
      )}
    />
    <PostBody post={post(null)} />
  </div>
</Story>

<!-- 본문 강조 크기. 같은 공유 fixture를 목록(md 16px)·상세(lg 20px)로 렌더해 의도된 크기 차이만 -->
<!-- 다르고 나머지 규칙은 같음을 확인한다(PROD-173). -->
<Story name="Size (목록 md / 상세 lg)" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <div>
      <div class="text-text-secondary text-xsm mb-1">목록 md (16px)</div>
      <PostBody post={makePost(postBodyCases[1]) as unknown as PostBody_post$key} size="md" />
    </div>
    <div>
      <div class="text-text-secondary text-xsm mb-1">상세 lg (20px)</div>
      <PostBody post={makePost(postBodyCases[1]) as unknown as PostBody_post$key} size="lg" />
    </div>
  </div>
</Story>
