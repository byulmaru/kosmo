<script module lang="ts">
  import { createTipTapDocumentFromPlainText } from '@kosmo/core/tiptap';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostBody from './PostBody.svelte';

  import type { PostBody_post$key } from '$mearie';

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
