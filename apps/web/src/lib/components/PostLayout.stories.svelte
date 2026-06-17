<script module lang="ts">
  import type { FragmentRefs } from '@mearie/svelte';
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import PostBody from './PostBody.svelte';
  import PostLayout from './PostLayout.svelte';

  // Storybook은 .storybook/mocks/mearie-svelte.ts에서 createFragment를 패스스루로 모킹하므로
  // 여기서는 평범한 데이터 객체를 fragment ref 자리에 그대로 넘긴다.
  const profile = (displayName: string, handle: string): FragmentRefs<'PostLayout_profile'> =>
    ({
      __typename: 'Profile',
      displayName,
      handle,
    }) as unknown as FragmentRefs<'PostLayout_profile'>;

  const post = (bodyText: string): FragmentRefs<'PostBody_post'> =>
    ({
      __typename: 'Post',
      id: 'story-post',
      content: { __typename: 'PostContent', id: 'story-post-content', bodyText },
      createdAt: '2026-04-27T21:14:00.000Z',
      visibility: 'PUBLIC',
    }) as unknown as FragmentRefs<'PostBody_post'>;

  const { Story } = defineMeta({
    title: 'KOSMO/PostLayout',
    component: PostLayout,
    tags: ['autodocs'],
  });
</script>

<Story
  name="Playground"
  args={{ avatarSize: 'md', href: '/@kosmo' }}
  argTypes={{
    avatarSize: { control: 'inline-radio', options: ['md', 'lg'] },
    href: { control: 'text' },
  }}
>
  {#snippet template(args)}
    <div class="w-[600px] px-4 py-4">
      <PostLayout
        avatarSize={args.avatarSize}
        href={args.href}
        profile={profile('코스모 작가', 'kosmo')}
      >
        <PostBody
          post={post(
            'Playground 본문이 들어가는 자리예요. 컨트롤로 아바타 크기·링크를 바꿔보세요.',
          )}
        />
      </PostLayout>
    </div>
  {/snippet}
</Story>

<!-- 게시글 디테일의 조립된 레이아웃(거터 아바타 + 작성자 이름 블록 + 본문 + 메타라인). -->
<Story name="Assembled (post detail)" asChild parameters={{ controls: { disable: true } }}>
  <article class="w-[600px] px-4 py-4">
    <PostLayout profile={profile('코스모 작가', 'kosmo')} href="/@kosmo">
      <PostBody
        post={post(
          '본문이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어나고, 본문은 이름 아래 컬럼에 정렬됩니다.',
        )}
      />
    </PostLayout>
  </article>
</Story>

<!-- 레이아웃 상태: 아바타 크기(md/lg), trailing 유무, 링크 유무, 긴 이름·handle. -->
<Story name="States" asChild parameters={{ controls: { disable: true } }}>
  <div class="grid w-[600px] gap-6">
    <PostLayout profile={profile('코스모 작가', 'kosmo')} href="/@kosmo">
      {#snippet trailing()}
        <time class="text-text-secondary text-sm">3시간 전</time>
      {/snippet}
      <p class="text-text-primary text-md">md 아바타 + trailing(작성 시간) 헤더.</p>
    </PostLayout>

    <PostLayout avatarSize="lg" profile={profile('큰 아바타 작가', 'large-avatar')}>
      <p class="text-text-primary text-md">lg 아바타(목록 표현). trailing 없음.</p>
    </PostLayout>

    <PostLayout profile={profile('링크 없는 작가', 'static')}>
      <p class="text-text-primary text-md">href 없음 — 이름·아바타가 링크가 아니다.</p>
    </PostLayout>

    <PostLayout
      profile={profile(
        '정말 아주 긴 표시 이름을 가진 게시글 작성자 프로필',
        'very-long-author-handle-that-should-not-break-layout',
      )}
      href="/@long"
    >
      {#snippet trailing()}
        <time class="text-text-secondary text-sm">2026. 04. 27</time>
      {/snippet}
      <p class="text-text-primary text-md">
        긴 이름·handle과 trailing이 함께 있어도 본문은 이름 아래 컬럼에 정렬된다.
      </p>
    </PostLayout>
  </div>
</Story>
