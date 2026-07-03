<script lang="ts">
  import { page } from '$app/state';
  import { createFragment } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import Avatar from '$lib/components/Avatar.svelte';
  import ProfileSwitcher from '$lib/components/ProfileSwitcher.svelte';
  import { formatCount, getProfileInitial } from '$lib/utils/profile';
  import type { SidebarNavigation_query$key } from '$mearie';

  type Props = {
    query?: SidebarNavigation_query$key | null;
    loading?: boolean;
    error?: boolean;
    surface?: 'desktop' | 'drawer';
    switcherOpen?: boolean;
    onNavigate?: () => void;
    onProfileStateChanged?: () => void;
  };

  const sidebarNavigationFragment = graphql(`
    fragment SidebarNavigation_query on Query {
      ...ProfileSwitcher_query
      currentSession {
        selectedProfile {
          id
          handle
          relativeHandle
          displayName
          followingCount
          followersCount
        }
      }
      me {
        id
        profiles {
          id
        }
      }
    }
  `);

  let {
    query = null,
    loading = false,
    error = false,
    surface = 'desktop',
    switcherOpen = $bindable(false),
    onNavigate = () => {},
    onProfileStateChanged = () => {},
  }: Props = $props();

  const navItems = [
    { href: '/home', label: '홈', path: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
    {
      href: '/search',
      label: '검색',
      path: 'm21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z',
    },
    {
      href: '/notifications',
      label: '알림',
      path: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    },
    {
      href: '/menu',
      label: '프로필',
      path: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    },
    { href: '/menu', label: '북마크', path: 'M6 3h12v18l-6-4-6 4z' },
    {
      href: '/menu',
      label: '팔로워 요청',
      path: 'M16 21a6 6 0 0 0-12 0M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
    },
    {
      href: '/menu',
      label: '프로필 설정',
      path: 'M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    },
  ];

  const sidebarNavigation = createFragment(sidebarNavigationFragment, () => query);

  const isActive = (item: (typeof navItems)[number]) => {
    if (page.url.pathname !== item.href) {
      return false;
    }

    if (item.href === '/menu') {
      return item.label === '프로필';
    }

    return true;
  };

  const hasProfiles = $derived((sidebarNavigation.data?.me?.profiles?.length ?? 0) > 0);
  const sidebarActiveProfile = $derived(
    sidebarNavigation.data?.currentSession?.selectedProfile ?? null,
  );
</script>

<!-- md~xl 구간 접힌 아이콘 레일. 풀 사이드바와 스크립트/상태를 공유한다. -->
{#snippet collapsedRail()}
  <div class="flex h-full w-full flex-col items-center gap-2 px-2 py-4">
    <ProfileSwitcher
      variant="compact"
      query={sidebarNavigation.data}
      {surface}
      {loading}
      bind:switcherOpen
      {onProfileStateChanged}
    />

    <nav class="flex w-full flex-col items-center gap-1" aria-label="주요 메뉴">
      {#each navItems as item}
        {@const isProfileItem = item.label === '프로필'}
        {@const profileHandle = isProfileItem ? (sidebarActiveProfile?.handle ?? null) : null}
        {@const profileDisabled = isProfileItem && !profileHandle}
        {@const resolvedHref = isProfileItem
          ? profileHandle
            ? `/@${profileHandle}`
            : undefined
          : item.href}
        {@const active = isProfileItem
          ? !!resolvedHref && page.url.pathname === resolvedHref
          : isActive(item)}
        <a
          class={`flex size-11 items-center justify-center rounded-lg transition ${active ? 'bg-surface font-semibold text-text-primary' : 'text-text-primary hover:bg-surface'} ${profileDisabled ? 'pointer-events-none opacity-50' : ''}`}
          href={resolvedHref}
          title={item.label}
          aria-label={item.label}
          aria-current={active ? 'page' : undefined}
          aria-disabled={profileDisabled ? 'true' : undefined}
          onclick={onNavigate}
        >
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d={item.path} />
          </svg>
        </a>
      {/each}
    </nav>

    <a
      class="flex size-11 items-center justify-center rounded-full bg-primary text-text-primary shadow-[1px_1px_2px_rgba(0,0,0,0.25)] transition hover:bg-primary-hover"
      href="/compose"
      title="글쓰기"
      aria-label="글쓰기"
      onclick={onNavigate}
    >
      <svg
        class="size-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    </a>

    <div class="mt-auto flex flex-col items-center gap-1">
      <button
        class="flex size-11 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface"
        type="button"
        title="로그아웃"
        aria-label="로그아웃"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      </button>
      <button
        class="flex size-11 items-center justify-center rounded-lg text-[#777777] transition hover:bg-surface"
        type="button"
        title="설정 & 지원"
        aria-label="설정 & 지원"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z" />
          <path
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
          />
        </svg>
      </button>
    </div>
  </div>
{/snippet}

<aside
  class={`flex h-full min-h-0 flex-col bg-white text-[#111111] ${
    surface === 'drawer'
      ? 'w-80 overflow-hidden rounded-r-2xl shadow-[4px_0_4px_rgba(0,0,0,0.4)]'
      : 'w-full border-r border-[#eaeaea]'
  }`}
>
  {#if surface !== 'drawer'}
    <div class="flex h-full w-full flex-col xl:hidden">{@render collapsedRail()}</div>
  {/if}

  <div class={`h-full min-h-0 w-full flex-col ${surface === 'drawer' ? 'flex' : 'hidden xl:flex'}`}>
    <section
      class="relative z-20 h-[260px] w-80 shrink-0 overflow-visible"
      aria-label="활성 프로필"
    >
      <div
        class="absolute left-0 top-0 h-[104px] w-80 overflow-hidden bg-gradient-to-br from-zinc-200 via-zinc-100 to-zinc-300 blur-[1px]"
      >
        <div
          class="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.9),transparent_35%),linear-gradient(135deg,rgba(17,17,17,0.14),transparent)]"
        ></div>
      </div>

      <div class="absolute left-5 top-[54px] flex w-[280px] items-start justify-between">
        <Avatar
          class="size-24 text-4xl shadow-[1px_1px_2px_rgba(0,0,0,0.25)]"
          initials={sidebarActiveProfile
            ? getProfileInitial(sidebarActiveProfile.displayName, sidebarActiveProfile.handle)
            : '?'}
        />
      </div>

      {#if sidebarActiveProfile}
        <button
          class="absolute right-5 top-[134px] inline-flex h-8 items-center justify-center rounded-lg bg-[#fce79a] px-3 text-sm font-bold text-[#111111] opacity-60"
          type="button"
          disabled
          aria-label="프로필 편집"
        >
          편집
        </button>
      {/if}

      <div class="absolute left-2.5 top-[140px] flex w-[300px] flex-col items-start px-2 py-2">
        <ProfileSwitcher
          variant="full"
          query={sidebarNavigation.data}
          {surface}
          {loading}
          bind:switcherOpen
          {onProfileStateChanged}
        />
        {#if sidebarActiveProfile}
          <p class="max-w-full truncate text-sm leading-[19.6px] text-[#777777]">
            {sidebarActiveProfile.relativeHandle}
          </p>
          <div class="mt-2 flex items-center gap-3 text-sm leading-[22px] text-black">
            <a
              class="flex items-center gap-2 border-b border-transparent px-1 hover:border-current"
              href={`/@${sidebarActiveProfile.handle}/following`}
              onclick={onNavigate}
              ><span>{formatCount(sidebarActiveProfile.followingCount ?? 0)}</span><span
                >팔로잉</span
              ></a
            >
            <a
              class="flex items-center gap-2 border-b border-transparent px-1 hover:border-current"
              href={`/@${sidebarActiveProfile.handle}/followers`}
              onclick={onNavigate}
              ><span>{formatCount(sidebarActiveProfile.followersCount ?? 0)}</span><span
                >팔로워</span
              ></a
            >
          </div>
        {:else if hasProfiles}
          <p class="text-sm leading-[19.6px] text-[#777777]">사용할 프로필을 선택해주세요.</p>
        {:else}
          <p class="text-sm leading-[19.6px] text-[#777777]">
            {loading ? '프로필을 불러오는 중입니다.' : '새 프로필을 만들어 시작하세요.'}
          </p>
        {/if}
      </div>
    </section>

    <section
      class="relative z-0 flex min-h-0 flex-1 flex-col justify-between overflow-y-auto border-t border-[#eaeaea] bg-white p-4"
    >
      <nav class="flex w-[264px] flex-col gap-1" aria-label="주요 메뉴">
        {#each navItems as item}
          {@const isProfileItem = item.label === '프로필'}
          {@const profileHandle = isProfileItem ? (sidebarActiveProfile?.handle ?? null) : null}
          {@const profileDisabled = isProfileItem && !profileHandle}
          {@const resolvedHref = isProfileItem
            ? profileHandle
              ? `/@${profileHandle}`
              : undefined
            : item.href}
          {@const active = isProfileItem
            ? !!resolvedHref && page.url.pathname === resolvedHref
            : isActive(item)}
          <a
            class={`inline-flex h-[45px] w-[264px] items-center gap-3 rounded-lg px-4 py-3 text-base leading-[21px] transition ${active ? 'bg-[#f4f4f5] font-semibold text-[#111111]' : 'font-normal text-[#111111] hover:bg-[#f8f8f8]'} ${profileDisabled ? 'pointer-events-none opacity-50' : ''}`}
            href={resolvedHref}
            aria-current={active ? 'page' : undefined}
            aria-disabled={profileDisabled ? 'true' : undefined}
            onclick={onNavigate}
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d={item.path} />
            </svg>
            <span>{item.label}</span>
          </a>
        {/each}
        {#if surface === 'drawer'}
          <a
            class="mt-1 inline-flex h-[45px] w-[264px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-bold text-text-primary transition hover:bg-primary-hover"
            href="/compose"
            onclick={onNavigate}
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
            <span>글쓰기</span>
          </a>
        {/if}
        <button
          class="inline-flex h-[45px] w-[264px] items-center gap-3 rounded-lg px-4 py-3 text-base font-normal leading-[21px] text-[#111111] transition hover:bg-[#f8f8f8]"
          type="button"
        >
          <svg
            class="size-5 text-[#404040]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          <span>로그아웃</span>
        </button>
      </nav>

      <div class="w-[264px] border-t border-[#eaeaea] py-1">
        <button
          class="inline-flex h-[45px] w-[264px] items-center justify-between rounded-lg px-4 py-3 text-sm leading-[21px] text-[#111111] transition hover:bg-[#f8f8f8]"
          type="button"
        >
          <span class="inline-flex items-center gap-3">
            <svg
              class="size-5 text-[#777777]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z" />
              <path
                d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
              />
            </svg>
            설정 &amp; 지원
          </span>
          <svg
            class="h-3.5 w-5 text-[#777777]"
            viewBox="0 0 20 14"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M10 14 0 2.5 2.2.5 10 9.4 17.8.5 20 2.5z" />
          </svg>
        </button>
      </div>
    </section>
  </div>

  <section class="sr-only" aria-label="프로필 상태">
    {#if loading}
      프로필을 불러오는 중입니다.
    {:else if error}
      프로필을 불러오지 못했습니다.
    {:else if !hasProfiles}
      사용 가능한 프로필이 없습니다.
    {/if}
  </section>
</aside>
