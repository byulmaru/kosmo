<script lang="ts">
  import { graphql } from '$mearie';
  import type { PostLayout_profile$key } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { Snippet } from 'svelte';

  import { tv } from '$lib/tv';
  import { getProfileInitial } from '$lib/utils/profile';

  import Avatar from './Avatar.svelte';
  import PostAuthorProfile from './PostAuthorProfile.svelte';

  // 게시글 레이아웃. Figma ThreadPost(702:6286)/PostCard(67:206) 구조를 따라 행 우선 2×2로 묶는다.
  //   ProfileRow: [아바타,        작성자 이름 블록 + trailing]
  //   ContentRow: [스레드 공간(예약), 본문(이후 미디어·투표·액션 등 형제 블록 스택)]
  // 각 행은 거터 셀(아바타 폭)과 콘텐츠 셀(나머지)로 나뉘어, 본문이 이름 아래로 정렬된다.
  // 거터 폭은 아바타 크기를 따른다: 디테일은 md(40px), 목록(PostCard)은 lg(48px).
  // ContentRow의 거터 셀은 이후 스레드 라인이 들어갈 자리로, 지금은 폭만 예약한다.
  type PostLayoutProps = {
    profile: PostLayout_profile$key;
    avatarSize?: 'md' | 'lg';
    // 이름 블록과 같은 행 우측에 렌더된다(목록의 작성 시간 등).
    trailing?: Snippet;
    children: Snippet;
    href?: string;
    // Svelte의 ClassValue(숫자·딕셔너리 포함)는 tailwind-merge가 받지 못하므로
    // 문자열로 좁힌다.
    class?: string | null;
  };

  let {
    profile,
    avatarSize = 'md',
    trailing,
    children,
    href,
    class: className,
  }: PostLayoutProps = $props();

  const profileFragment = createFragment(
    graphql(`
      fragment PostLayout_profile on Profile {
        displayName
        handle
        ...PostAuthorProfile_profile
      }
    `),
    () => profile,
  );

  const initials = $derived(
    getProfileInitial(profileFragment.data.displayName, profileFragment.data.handle),
  );

  const postLayout = tv({
    slots: {
      // gap-1(4px): ProfileRow와 ContentRow 사이 세로 간격을 레이아웃이 직접 소유한다.
      // 본문(children)이 자기 위 여백을 따로 두지 않도록 소비처에서 mt-*를 넘기지 않는다.
      root: 'flex flex-col gap-1',
      row: 'flex items-start gap-3',
      // 거터 셀 폭 = 아바타 폭. 두 행이 같은 폭을 쓰므로 본문이 이름 아래로 정렬된다.
      gutter: 'shrink-0',
      content: 'min-w-0 flex-1',
    },
    variants: {
      avatarSize: {
        md: { gutter: 'w-10' },
        lg: { gutter: 'w-12' },
      },
    },
    defaultVariants: {
      avatarSize: 'md',
    },
  });

  const slots = $derived(postLayout({ avatarSize }));
</script>

<div class={slots.root({ class: className })}>
  <!-- ProfileRow: 아바타 + 작성자 이름 블록/메뉴 -->
  <div class={slots.row()}>
    <!-- 거터 셀. href면 이름 블록 링크와 목적지가 같으므로 탭 순서·스크린리더에서는 숨긴다. -->
    {#if href}
      <a {href} tabindex="-1" aria-hidden="true" class={slots.gutter()}>
        <Avatar size={avatarSize} {initials} />
      </a>
    {:else}
      <div class={slots.gutter()}>
        <Avatar size={avatarSize} {initials} />
      </div>
    {/if}
    <div class={slots.content({ class: 'flex items-start justify-between gap-2' })}>
      {#if href}
        <PostAuthorProfile {href} profile={profileFragment.data} />
      {:else}
        <PostAuthorProfile profile={profileFragment.data} />
      {/if}
      {#if trailing}
        <div class="shrink-0">
          {@render trailing()}
        </div>
      {/if}
    </div>
  </div>

  <!-- ContentRow: 스레드 공간(예약) + 본문 -->
  <div class={slots.row()}>
    <!-- 이후 스레드 라인이 들어갈 거터 셀. 지금은 폭만 예약한다. -->
    <div class={slots.gutter()} aria-hidden="true"></div>
    <div class={slots.content()}>
      {@render children()}
    </div>
  </div>
</div>
