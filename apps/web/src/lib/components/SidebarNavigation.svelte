<script lang="ts">
  import { page } from '$app/state';
  import { profileHandleSchema } from '@kosmo/core/validation';
  import { createFragment, createMutation } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import { formatCount, getProfileInitial } from '$lib/utils/profile';
  import type { DataOf } from '@mearie/svelte';
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
      currentSession {
        selectedProfile {
          id
          handle
          displayName
          followersCount
          followingCount
        }
      }
      me {
        id
        profiles {
          id
          handle
          displayName
          followersCount
          followingCount
        }
      }
    }
  `);

  const selectSidebarProfileMutation = graphql(`
    mutation SelectSidebarProfileMutation($id: ID!) {
      selectProfile(input: { id: $id }) {
        __typename
        ... on SelectProfileSuccess {
          profile {
            id
            handle
            displayName
            followersCount
            followingCount
          }
        }
        ... on NotFoundError {
          message
        }
      }
    }
  `);

  const createSidebarProfileMutation = graphql(`
    mutation CreateSidebarProfileMutation($handle: String!) {
      createProfile(input: { handle: $handle }) {
        __typename
        ... on CreateProfileSuccess {
          profile {
            id
            handle
            displayName
            followersCount
            followingCount
          }
        }
        ... on ConflictError {
          message
          field
        }
      }
    }
  `);

  type SidebarNavigationData = DataOf<typeof sidebarNavigationFragment>;
  type ProfileSummary = NonNullable<SidebarNavigationData['me']>['profiles'][number];

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
  const [selectSidebarProfile] = createMutation(selectSidebarProfileMutation);
  const [createSidebarProfile] = createMutation(createSidebarProfileMutation);
  let profileError = $state<string | null>(null);
  let profileCreationError = $state<string | null>(null);
  let profileCreationOpen = $state(false);
  let newProfileHandle = $state('');
  let profileActionLoading = $state(false);
  let selectedProfileOverride = $state<ProfileSummary | null>(null);
  let profilesOverride = $state<ProfileSummary[] | null>(null);

  const isActive = (item: (typeof navItems)[number]) => {
    if (page.url.pathname !== item.href) {
      return false;
    }

    if (item.href === '/menu') {
      return item.label === '프로필';
    }

    return true;
  };

  const getProfileHandleError = (handle: string) => {
    if (!handle) {
      return '프로필 핸들을 입력해주세요.';
    }

    const result = profileHandleSchema.safeParse(handle);

    return result.success
      ? null
      : (result.error.issues[0]?.message ?? '프로필 핸들 형식을 확인해주세요.');
  };

  const creatingOrSwitching = $derived(profileActionLoading || loading);
  const sidebarProfiles = $derived(profilesOverride ?? sidebarNavigation.data?.me?.profiles ?? []);
  const sidebarActiveProfile = $derived(
    selectedProfileOverride ?? sidebarNavigation.data?.currentSession?.selectedProfile ?? null,
  );

  const openProfileSwitcher = () => {
    switcherOpen = !switcherOpen;
    if (!switcherOpen) {
      profileCreationOpen = false;
      profileCreationError = null;
    }
  };

  const chooseProfile = async (id: string) => {
    if (sidebarActiveProfile?.id === id || creatingOrSwitching) {
      return;
    }

    profileError = null;
    profileActionLoading = true;

    try {
      const data = await selectSidebarProfile({ id });

      if (data.selectProfile.__typename !== 'SelectProfileSuccess') {
        profileError = data.selectProfile.message;
        return;
      }

      selectedProfileOverride =
        sidebarProfiles.find((profile: ProfileSummary) => profile.id === id) ??
        data.selectProfile.profile;
      switcherOpen = false;
      profileCreationOpen = false;
      onProfileStateChanged();
    } catch (error) {
      profileError = error instanceof Error ? error.message : '프로필을 전환하지 못했습니다.';
    } finally {
      profileActionLoading = false;
    }
  };

  const createAndSelectProfile = async (event: SubmitEvent) => {
    event.preventDefault();

    const handle = newProfileHandle.trim();

    if (creatingOrSwitching) {
      return;
    }

    const handleError = getProfileHandleError(handle);
    if (handleError) {
      profileCreationError = handleError;
      return;
    }

    profileCreationError = null;
    profileError = null;
    profileActionLoading = true;

    try {
      const created = await createSidebarProfile({ handle });
      if (created.createProfile.__typename !== 'CreateProfileSuccess') {
        profileCreationError = created.createProfile.message;
        return;
      }

      const createdProfile = created.createProfile.profile;

      newProfileHandle = '';
      profileCreationOpen = false;

      const selected = await selectSidebarProfile({ id: created.createProfile.profile.id });
      if (selected.selectProfile.__typename !== 'SelectProfileSuccess') {
        profileError = selected.selectProfile.message;
        return;
      }

      profilesOverride = [...sidebarProfiles, createdProfile];
      selectedProfileOverride = createdProfile;
      switcherOpen = false;
      profileCreationOpen = false;
      onProfileStateChanged();
    } catch (error) {
      profileCreationError =
        error instanceof Error ? error.message : '프로필을 생성하지 못했습니다.';
    } finally {
      profileActionLoading = false;
    }
  };
</script>

<!-- 프로필 전환 드롭다운. 접힌 레일/풀 사이드바 양쪽에서 위치만 바꿔 재사용한다. -->
{#snippet switcherMenu(idSuffix: string)}
  {@const activeProfile = sidebarActiveProfile}
  <div
    class="flex w-[280px] flex-col gap-0.5 rounded-[14px] border border-[#eaeaea] bg-white p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.16)]"
    role="menu"
    aria-label="프로필 전환"
  >
    {#each sidebarProfiles as profile}
      {@const selected = activeProfile?.id === profile.id}
      <button
        class={`flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left transition disabled:opacity-50 ${selected ? 'bg-[#f6f6f6]' : 'hover:bg-[#f8f8f8]'}`}
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        disabled={creatingOrSwitching}
        onclick={() => chooseProfile(profile.id)}
      >
        <span
          class={`flex shrink-0 items-center justify-center rounded-full bg-[#fce79a] font-bold text-[#111111] ${selected ? 'size-12 text-base' : 'size-8 text-sm'}`}
          aria-hidden="true"
        >
          {getProfileInitial(profile.displayName, profile.handle)}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-px overflow-hidden">
          <span class="truncate text-sm font-bold text-[#111111]">{profile.displayName}</span>
          <span class="truncate text-xs text-[#777777]">@{profile.handle}</span>
        </span>
        {#if selected}
          <span class="text-[15px] font-bold text-[#111111]" aria-hidden="true">✓</span>
        {/if}
      </button>
    {/each}

    <div class="my-0.5 h-px w-full bg-[#eaeaea]"></div>

    {#if profileCreationOpen}
      <form
        class="flex flex-col gap-1 p-1"
        aria-label="새 프로필 만들기"
        onsubmit={createAndSelectProfile}
      >
        <label class="sr-only" for={`profile-handle-${surface}-${idSuffix}`}>프로필 핸들</label>
        <div class="flex gap-2">
          <input
            id={`profile-handle-${surface}-${idSuffix}`}
            class="min-w-0 flex-1 rounded-lg border border-[#d4d4d8] px-3 py-2 text-sm outline-none transition placeholder:text-[#a1a1aa] focus:border-[#111111]"
            name="handle"
            autocomplete="off"
            aria-describedby={`profile-handle-help-${surface}-${idSuffix}`}
            aria-invalid={profileCreationError ? 'true' : undefined}
            placeholder="새 프로필 핸들"
            disabled={creatingOrSwitching}
            bind:value={newProfileHandle}
          />
          <button
            class="rounded-lg bg-[#fce79a] px-3 py-2 text-sm font-bold text-[#111111] transition hover:bg-[#f9dc6d] disabled:opacity-50"
            type="submit"
            disabled={creatingOrSwitching}
          >
            만들기
          </button>
        </div>
        <p
          id={`profile-handle-help-${surface}-${idSuffix}`}
          class="px-1 text-xs leading-4 text-[#777777]"
        >
          영문, 숫자, 밑줄(_)만 사용할 수 있어요.
        </p>
        {#if profileCreationError}
          <p class="px-1 text-xs leading-4 text-red-600">{profileCreationError}</p>
        {/if}
      </form>
    {:else}
      <button
        class="flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left transition hover:bg-[#f8f8f8] disabled:opacity-50"
        type="button"
        role="menuitem"
        disabled={creatingOrSwitching}
        onclick={() => {
          profileCreationError = null;
          profileCreationOpen = true;
        }}
      >
        <span class="w-8 text-center text-lg font-bold text-[#111111]" aria-hidden="true">+</span>
        <span class="text-sm font-medium text-[#111111]">새 프로필 추가</span>
      </button>
    {/if}
  </div>
{/snippet}

<!-- md~xl 구간 접힌 아이콘 레일. 풀 사이드바와 스크립트/상태를 공유한다. -->
{#snippet collapsedRail()}
  <div class="flex h-full w-full flex-col items-center gap-2 px-2 py-4">
    <div class="relative">
      <button
        class="flex size-11 items-center justify-center rounded-full bg-text-primary text-lg font-bold text-white shadow-[1px_1px_2px_rgba(0,0,0,0.25)]"
        type="button"
        aria-label="프로필 목록"
        aria-expanded={switcherOpen}
        onclick={openProfileSwitcher}
      >
        {#if sidebarActiveProfile}
          {getProfileInitial(sidebarActiveProfile.displayName, sidebarActiveProfile.handle)}
        {:else}
          ?
        {/if}
      </button>
      {#if switcherOpen}
        <div class="absolute left-[calc(100%+0.5rem)] top-0 z-30">
          {@render switcherMenu('rail')}
        </div>
      {/if}
    </div>

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
      class="flex size-11 items-center justify-center rounded-full bg-primary text-text-primary shadow-[1px_1px_2px_rgba(0,0,0,0.25)] transition hover:bg-[#f9dc6d]"
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
        class="flex size-11 items-center justify-center rounded-lg text-[#404040] transition hover:bg-surface"
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
  class={`flex h-full flex-col bg-white text-[#111111] ${
    surface === 'drawer'
      ? 'w-80 overflow-hidden rounded-r-2xl shadow-[4px_0_4px_rgba(0,0,0,0.4)]'
      : 'w-full border-r border-[#eaeaea]'
  }`}
>
  {#if surface !== 'drawer'}
    <div class="flex h-full w-full flex-col xl:hidden">{@render collapsedRail()}</div>
  {/if}

  <div class={`h-full w-full flex-col ${surface === 'drawer' ? 'flex' : 'hidden xl:flex'}`}>
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

      {#if sidebarActiveProfile}
        {@const activeProfile = sidebarActiveProfile}
        <div class="absolute left-5 top-[54px] flex w-[280px] items-start justify-between">
          <div
            class="flex size-24 items-center justify-center rounded-full bg-[#111111] text-4xl font-bold text-white shadow-[1px_1px_2px_rgba(0,0,0,0.25)]"
          >
            {getProfileInitial(activeProfile.displayName, activeProfile.handle)}
          </div>
        </div>

        <button
          class="absolute right-5 top-[134px] inline-flex h-8 items-center justify-center rounded-lg bg-[#fce79a] px-3 text-sm font-bold text-[#111111] opacity-60"
          type="button"
          disabled
          aria-label="프로필 편집"
        >
          편집
        </button>

        <div class="absolute left-2.5 top-[140px] flex w-[300px] flex-col items-start px-2 py-2">
          <button
            class="flex h-[42px] max-w-full items-center gap-2 py-[5px] text-left"
            type="button"
            aria-label="프로필 목록"
            aria-expanded={switcherOpen}
            onclick={openProfileSwitcher}
          >
            <span class="truncate text-2xl font-bold leading-[32px] text-black/85"
              >{activeProfile.displayName}</span
            >
            <svg
              class="size-4 shrink-0 text-black/45"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4.2 6.2 8 10l3.8-3.8 1.1 1.1L8 12.2 3.1 7.3z" />
            </svg>
          </button>
          <p class="max-w-full truncate text-sm leading-[19.6px] text-[#777777]">
            @{activeProfile.handle}
          </p>
          <div class="mt-2 flex items-center gap-3 text-sm leading-[22px] text-black">
            <span class="flex items-center gap-2 px-1"
              ><span>{formatCount(activeProfile.followersCount ?? 0)}</span><span>팔로워</span
              ></span
            >
            <span class="flex items-center gap-2 px-1"
              ><span>{formatCount(activeProfile.followingCount ?? 0)}</span><span>팔로잉</span
              ></span
            >
          </div>
        </div>
      {:else if sidebarNavigation.data && sidebarProfiles.length > 0}
        <div class="absolute left-5 top-[54px] flex w-[280px] items-start justify-between">
          <div
            class="flex size-24 items-center justify-center rounded-full bg-zinc-200 text-3xl font-bold text-zinc-500 shadow-[1px_1px_2px_rgba(0,0,0,0.25)]"
          >
            ?
          </div>
        </div>

        <div class="absolute left-2.5 top-[140px] flex w-[300px] flex-col items-start px-2 py-2">
          <button
            class="flex h-[42px] max-w-full items-center gap-2 py-[5px] text-left"
            type="button"
            aria-label="프로필 목록"
            aria-expanded={switcherOpen}
            onclick={openProfileSwitcher}
          >
            <span class="truncate text-2xl font-bold leading-[32px] text-black/85">프로필 선택</span
            >
            <svg
              class="size-4 shrink-0 text-black/45"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4.2 6.2 8 10l3.8-3.8 1.1 1.1L8 12.2 3.1 7.3z" />
            </svg>
          </button>
          <p class="text-sm leading-[19.6px] text-[#777777]">사용할 프로필을 선택해주세요.</p>
        </div>
      {:else}
        <div
          class="absolute left-5 top-[54px] flex size-24 items-center justify-center rounded-full bg-zinc-200 text-3xl font-bold text-zinc-500 shadow-[1px_1px_2px_rgba(0,0,0,0.25)]"
        >
          ?
        </div>
        <div class="absolute left-2.5 top-[140px] flex w-[300px] flex-col px-2 py-2">
          <button
            class="flex h-[42px] max-w-full items-center gap-2 py-[5px] text-left"
            type="button"
            aria-label="프로필 목록"
            aria-expanded={switcherOpen}
            onclick={openProfileSwitcher}
          >
            <span class="truncate text-2xl font-bold leading-[32px] text-black/85">프로필</span>
            <svg
              class="size-4 shrink-0 text-black/45"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4.2 6.2 8 10l3.8-3.8 1.1 1.1L8 12.2 3.1 7.3z" />
            </svg>
          </button>
          <p class="text-sm leading-[19.6px] text-[#777777]">
            {loading ? '프로필을 불러오는 중입니다.' : '새 프로필을 만들어 시작하세요.'}
          </p>
        </div>
      {/if}

      {#if switcherOpen}
        <div class="absolute left-4 top-[210px] z-10">
          {@render switcherMenu('full')}
        </div>
      {/if}
    </section>

    <section
      class="relative z-0 flex min-h-0 flex-1 flex-col justify-between border-t border-[#eaeaea] bg-white p-4"
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
        <a
          class="mt-1 inline-flex h-[45px] w-[264px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-bold text-text-primary transition hover:bg-[#f9dc6d]"
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

  <section class="sr-only" aria-label="프로필 전환 상태">
    {#if profileActionLoading && profileCreationOpen}
      프로필 생성 중
    {/if}

    {#if profileActionLoading && !profileCreationOpen}
      전환 중
    {/if}

    {#if loading}
      프로필을 불러오는 중입니다.
    {:else if error}
      프로필을 불러오지 못했습니다.
    {:else if sidebarProfiles.length === 0}
      사용 가능한 프로필이 없습니다.
    {/if}

    {#if profileError}
      {profileError}
    {/if}

    {#if profileCreationError}
      {profileCreationError}
    {/if}
  </section>
</aside>
