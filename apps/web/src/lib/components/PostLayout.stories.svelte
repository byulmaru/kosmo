<script module lang="ts">
  import { createTipTapDocumentFromPlainText } from '@kosmo/core/tiptap';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostLayout from './PostLayout.svelte';

  import type { PostLayout_post$key } from '$mearie';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const post = (
    bodyText: string,
    {
      displayName = '코스모 작가',
      handle = 'kosmo',
      visibility = 'PUBLIC',
    }: {
      displayName?: string;
      handle?: string;
      visibility?: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS' | 'DIRECT';
    } = {},
  ): PostLayout_post$key =>
    ({
      __typename: 'Post',
      id: 'story-post',
      createdAt: '2026-04-27T21:14:00.000Z',
      visibility,
      profile: {
        __typename: 'Profile',
        id: 'story-profile',
        handle,
        displayName,
      },
      content: {
        __typename: 'PostContent',
        id: 'story-post-content',
        bodyJson: createTipTapDocumentFromPlainText(bodyText),
        bodyText,
      },
    }) as unknown as PostLayout_post$key;

  const { Story } = defineMeta({
    title: 'KOSMO/PostLayout',
    component: PostLayout,
    tags: ['autodocs'],
  });
</script>

<Story name="Playground" args={{ post: post('Playground 본문이 들어가는 자리예요.') }} />

<!-- 게시글 상세의 조립된 레이아웃(거터 아바타 + 작성자 이름 블록 + 본문 + 시각·공개범위). -->
<Story name="Assembled (post detail)" asChild parameters={{ controls: { disable: true } }}>
  <article class="w-[600px] px-4 py-4">
    <PostLayout
      post={post(
        '본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어나고, 본문은 이름 아래 컬럼에 정렬됩니다.',
      )}
    />
  </article>
</Story>

<!-- 레이아웃 상태: 공개 범위 4종, 긴 이름·handle. 본문은 항상 이름 아래 컬럼에 정렬된다. -->
<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-6">
    <PostLayout post={post('전체 공개 게시글. 헤더 아래 본문, 본문 아래 시각·공개범위.')} />
    <PostLayout post={post('조용히 공개 게시글.', { visibility: 'UNLISTED' })} />
    <PostLayout post={post('팔로워 공개 게시글.', { visibility: 'FOLLOWERS' })} />
    <PostLayout post={post('다이렉트 게시글.', { visibility: 'DIRECT' })} />
    <PostLayout
      post={post('긴 이름·handle과 함께여도 본문은 이름 아래 컬럼에 정렬된다.', {
        displayName: '정말 아주 긴 표시 이름을 가진 게시글 작성자 프로필',
        handle: 'very-long-author-handle-that-should-not-break-layout',
      })}
    />
  </div>
</Story>
