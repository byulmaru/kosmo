<script module lang="ts">
  import type { FragmentRefs } from '@mearie/svelte';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostBody from './PostBody.svelte';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const post = (
    bodyText: string | null,
    visibility: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS' | 'DIRECT' = 'PUBLIC',
  ): FragmentRefs<'PostBody_post'> =>
    ({
      __typename: 'Post',
      id: 'story-post',
      content:
        bodyText === null
          ? null
          : { __typename: 'PostContent', id: 'story-post-content', bodyText },
      createdAt: '2026-04-27T21:14:00.000Z',
      visibility,
    }) as unknown as FragmentRefs<'PostBody_post'>;

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

<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-8">
    <PostBody post={post('짧은 본문 한 줄.')} />
    <PostBody
      post={post(
        '본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어납니다.\n줄바꿈도 그대로 보존됩니다.\n\n문단 사이 빈 줄도 유지됩니다.',
      )}
    />
    <PostBody post={post(null)} />
    <PostBody post={post('팔로워 공개 게시글.', 'FOLLOWERS')} />
    <PostBody post={post('다이렉트 게시글.', 'DIRECT')} />
    <PostBody post={post('조용히 공개 게시글.', 'UNLISTED')} />
  </div>
</Story>
