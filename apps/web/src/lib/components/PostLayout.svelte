<script lang="ts">
  import { graphql } from '$mearie';
  import type { PostLayout_profile$key } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { Snippet } from 'svelte';

  import { tv } from '$lib/tv';
  import { getProfileInitial } from '$lib/utils/profile';

  import Avatar from './Avatar.svelte';
  import ProfileNameBlock from './ProfileNameBlock.svelte';

  // 게시글 레이아웃. Figma ThreadPost(702:6286)/PostCard(67:206)의 column 구조를 따라
  // 좌측 거터(아바타)와 우측 콘텐츠 컬럼으로 나뉜다.
  //   거터: 아바타(md 40px / lg 48px). self-stretch로 행 전체 높이를 차지해, 이후 스레드 라인이
  //         아바타 아래로 연장될 자리를 예약한다.
  //   콘텐츠: [작성자 이름 블록 + trailing] 헤더 / 본문(이후 미디어·투표·액션 등 형제 블록 스택).
  // 본문(children)은 이름 블록과 같은 컬럼에 쌓여 자동으로 이름 아래로 정렬된다.
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
        ...ProfileNameBlock_profile
      }
    `),
    () => profile,
  );

  const initials = $derived(
    getProfileInitial(profileFragment.data.displayName, profileFragment.data.handle),
  );

  const postLayout = tv({
    slots: {
      root: 'flex items-start gap-3',
      // 거터 폭 = 아바타 폭. self-stretch로 행 전체 높이를 차지한다(이후 스레드 라인 자리).
      gutter: 'flex shrink-0 flex-col self-stretch',
      // gap-1(4px): 작성자 헤더와 본문 사이 세로 간격을 레이아웃이 직접 소유한다.
      // 본문(children)이 자기 위 여백을 따로 두지 않도록 소비처에서 mt-*를 넘기지 않는다.
      content: 'flex min-w-0 flex-1 flex-col gap-1',
      header: 'flex items-start justify-between gap-2',
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
  <!-- 거터: 아바타. href면 이름 블록 링크와 목적지가 같으므로 탭 순서·스크린리더에서는 숨긴다. -->
  <div class={slots.gutter()}>
    {#if href}
      <a {href} tabindex="-1" aria-hidden="true">
        <Avatar size={avatarSize} {initials} />
      </a>
    {:else}
      <Avatar size={avatarSize} {initials} />
    {/if}
  </div>

  <!-- 콘텐츠 컬럼: 작성자 헤더 + 본문(형제 블록 스택). -->
  <div class={slots.content()}>
    <div class={slots.header()}>
      {#if href}
        <ProfileNameBlock {href} profile={profileFragment.data} />
      {:else}
        <ProfileNameBlock profile={profileFragment.data} />
      {/if}
      {#if trailing}
        <div class="shrink-0">
          {@render trailing()}
        </div>
      {/if}
    </div>
    {@render children()}
  </div>
</div>
