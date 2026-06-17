<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { Snippet } from 'svelte';

  import { tv } from '$lib/tv';
  import { getProfileInitial } from '$lib/utils/profile';

  import Avatar from './Avatar.svelte';
  import PostAuthorProfile from './PostAuthorProfile.svelte';

  // 게시글 레이아웃. Figma ThreadPost(702:6286)/PostCard(67:206) 구조를 2×2 그리드로 따른다:
  //   (1,1) 아바타            (1,2) 작성자 이름 블록 + trailing
  //   (2,1) 스레드 공간(예약)  (2,2) 본문(이후 미디어·투표·액션 등 형제 블록 스택)
  // 거터 폭은 아바타 크기를 따른다: 디테일은 md(40px), 목록(PostCard)은 lg(48px).
  // (2,1)은 이후 스레드 라인이 들어갈 자리로 지금은 그리드 트랙으로 폭만 예약한다.
  type PostLayoutProps = {
    profile: FragmentRefs<'PostLayout_profile'>;
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
    base: 'grid items-start gap-x-3',
    variants: {
      avatarSize: {
        // 거터 컬럼 폭 = 아바타 폭(md 40px / lg 48px). 본문은 자동으로 이름 아래 컬럼에 정렬된다.
        md: 'grid-cols-[2.5rem_minmax(0,1fr)]',
        lg: 'grid-cols-[3rem_minmax(0,1fr)]',
      },
    },
    defaultVariants: {
      avatarSize: 'md',
    },
  });
</script>

<div class={postLayout({ avatarSize, class: className })}>
  <!-- (1,1) 아바타 거터. href면 이름 블록 링크와 목적지가 같으므로 탭 순서·스크린리더에서는 숨긴다. -->
  {#if href}
    <a {href} tabindex="-1" aria-hidden="true">
      <Avatar size={avatarSize} {initials} />
    </a>
  {:else}
    <Avatar size={avatarSize} {initials} />
  {/if}

  <!-- (1,2) 작성자 이름 블록 + trailing -->
  <div class="flex items-start justify-between gap-2">
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

  <!-- (2,1) 스레드 공간(예약). 폭은 그리드 트랙이 잡고, 이후 스레드 라인이 이 셀에 들어간다. -->
  <div aria-hidden="true"></div>

  <!-- (2,2) 본문 + 이후 미디어·투표·액션 등 형제 블록 -->
  <div class="min-w-0">
    {@render children()}
  </div>
</div>
