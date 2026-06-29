<script lang="ts">
  import { profileHandleSchema } from '@kosmo/core/validation';
  import { createFragment, createMutation } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import Avatar from '$lib/components/Avatar.svelte';
  import { getFirstGraphQLError } from '$lib/graphql/error';
  import { getProfileInitial } from '$lib/utils/profile';
  import type { ProfileSwitcher_query$key } from '$mearie';

  type Props = {
    query?: ProfileSwitcher_query$key | null;
    variant: 'compact' | 'full';
    surface?: 'desktop' | 'drawer';
    loading?: boolean;
    switcherOpen?: boolean;
    onProfileStateChanged?: () => void;
  };

  let {
    query = null,
    variant,
    surface = 'desktop',
    loading = false,
    switcherOpen = $bindable(false),
    onProfileStateChanged = () => {},
  }: Props = $props();

  const profileSwitcherFragment = graphql(`
    fragment ProfileSwitcher_query on Query {
      currentSession {
        selectedProfile {
          id
          handle
          relativeHandle
          displayName
        }
      }
      me {
        id
        profiles {
          id
          handle
          relativeHandle
          displayName
        }
      }
    }
  `);

  const selectProfileMutation = graphql(`
    mutation ProfileSwitcherSelectProfileMutation($id: ID!) {
      selectProfile(input: { id: $id }) {
        profile {
          id
          handle
          relativeHandle
          displayName
        }
        session {
          id
          selectedProfile {
            id
            handle
            relativeHandle
            displayName
          }
        }
      }
    }
  `);

  const createProfileMutation = graphql(`
    mutation ProfileSwitcherCreateProfileMutation($handle: String!) {
      createProfile(input: { handle: $handle }) {
        profile {
          id
          handle
          relativeHandle
          displayName
        }
      }
    }
  `);

  const switcher = createFragment(profileSwitcherFragment, () => query);
  const [selectProfile] = createMutation(selectProfileMutation);
  const [createProfile] = createMutation(createProfileMutation);

  let profileError = $state<string | null>(null);
  let profileCreationError = $state<string | null>(null);
  let profileCreationOpen = $state(false);
  let newProfileHandle = $state('');
  let profileActionLoading = $state(false);

  const idSuffix = $derived(`${surface}-${variant}`);
  const creatingOrSwitching = $derived(profileActionLoading || loading);
  const profiles = $derived(switcher.data?.me?.profiles ?? []);
  const activeProfile = $derived(switcher.data?.currentSession?.selectedProfile ?? null);
  const triggerLabel = $derived(
    activeProfile ? activeProfile.displayName : profiles.length > 0 ? '프로필 선택' : '프로필',
  );
  const triggerInitials = $derived(
    activeProfile ? getProfileInitial(activeProfile.displayName, activeProfile.handle) : '?',
  );

  const getProfileHandleError = (handle: string) => {
    if (!handle) {
      return '프로필 핸들을 입력해주세요.';
    }

    const result = profileHandleSchema.safeParse(handle);

    return result.success
      ? null
      : (result.error.issues[0]?.message ?? '프로필 핸들 형식을 확인해주세요.');
  };

  const toggleSwitcher = () => {
    switcherOpen = !switcherOpen;
  };

  // switcherOpen은 compact/full(및 데스크톱/드로어) 인스턴스가 공유하므로, 메뉴가 닫히면
  // 어느 트리거로 닫혔든 이 인스턴스의 생성 폼·에러를 비워 다음 열림에서 목록부터 보이게 한다.
  $effect(() => {
    if (!switcherOpen) {
      profileCreationOpen = false;
      profileCreationError = null;
    }
  });

  const chooseProfile = async (id: string) => {
    if (activeProfile?.id === id || creatingOrSwitching) {
      return;
    }

    profileError = null;
    profileActionLoading = true;

    try {
      await selectProfile({ id });
      switcherOpen = false;
      profileCreationOpen = false;
      onProfileStateChanged();
    } catch (error) {
      const graphQLError = getFirstGraphQLError(error);

      profileError = graphQLError?.message ?? '프로필을 전환하지 못했습니다.';
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
      let createdProfileId: string;

      try {
        const created = await createProfile({ handle });

        createdProfileId = created.createProfile.profile.id;
        newProfileHandle = '';
        profileCreationOpen = false;
      } catch (error) {
        const graphQLError = getFirstGraphQLError(error);

        profileCreationError = graphQLError?.message ?? '프로필을 생성하지 못했습니다.';
        return;
      }

      try {
        await selectProfile({ id: createdProfileId });
      } catch (error) {
        const graphQLError = getFirstGraphQLError(error);

        profileError = graphQLError?.message ?? '프로필을 전환하지 못했습니다.';
        return;
      }

      switcherOpen = false;
      profileCreationOpen = false;
      onProfileStateChanged();
    } finally {
      profileActionLoading = false;
    }
  };
</script>

<!-- 프로필 전환 드롭다운. 접힌 레일/풀 사이드바 양쪽에서 위치만 바꿔 재사용한다. -->
{#snippet switcherMenu()}
  <div
    class="flex w-[280px] flex-col gap-0.5 rounded-[14px] border border-[#eaeaea] bg-white p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.16)]"
    role="menu"
    aria-label="프로필 전환"
  >
    {#each profiles as profile}
      {@const selected = activeProfile?.id === profile.id}
      <button
        class={`flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left transition disabled:opacity-50 ${selected ? 'bg-[#f6f6f6]' : 'hover:bg-[#f8f8f8]'}`}
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        disabled={creatingOrSwitching}
        onclick={() => chooseProfile(profile.id)}
      >
        <Avatar
          size={selected ? 'lg' : 'sm'}
          initials={getProfileInitial(profile.displayName, profile.handle)}
        />
        <span class="flex min-w-0 flex-1 flex-col gap-px overflow-hidden">
          <span class="truncate text-sm font-bold text-[#111111]">{profile.displayName}</span>
          <span class="truncate text-xs text-[#777777]">{profile.relativeHandle}</span>
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
        <label class="sr-only" for={`profile-handle-${idSuffix}`}>프로필 핸들</label>
        <div class="flex gap-2">
          <input
            id={`profile-handle-${idSuffix}`}
            class="min-w-0 flex-1 rounded-lg border border-[#d4d4d8] px-3 py-2 text-sm outline-none transition placeholder:text-[#a1a1aa] focus:border-[#111111]"
            name="handle"
            autocomplete="off"
            aria-describedby={`profile-handle-help-${idSuffix}`}
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
        <p id={`profile-handle-help-${idSuffix}`} class="px-1 text-xs leading-4 text-[#777777]">
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

{#if variant === 'compact'}
  <div class="relative">
    <button
      class="flex size-11 items-center justify-center rounded-full"
      type="button"
      aria-label="프로필 목록"
      aria-expanded={switcherOpen}
      onclick={toggleSwitcher}
    >
      <Avatar size="md" class="shadow-[1px_1px_2px_rgba(0,0,0,0.25)]" initials={triggerInitials} />
    </button>
    {#if switcherOpen}
      <div class="absolute left-[calc(100%+0.5rem)] top-0 z-30">
        {@render switcherMenu()}
      </div>
    {/if}
  </div>
{:else}
  <div class="relative">
    <button
      class="flex h-[42px] max-w-full items-center gap-2 py-[5px] text-left"
      type="button"
      aria-label="프로필 목록"
      aria-expanded={switcherOpen}
      onclick={toggleSwitcher}
    >
      <span class="truncate text-2xl font-bold leading-[32px] text-black/85">{triggerLabel}</span>
      <svg
        class="size-4 shrink-0 text-black/45"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M4.2 6.2 8 10l3.8-3.8 1.1 1.1L8 12.2 3.1 7.3z" />
      </svg>
    </button>
    {#if switcherOpen}
      <div class="absolute left-0 top-[calc(100%+0.5rem)] z-10">
        {@render switcherMenu()}
      </div>
    {/if}
  </div>
{/if}

<section class="sr-only" aria-label="프로필 전환 상태">
  {#if profileActionLoading && profileCreationOpen}
    프로필 생성 중
  {/if}

  {#if profileActionLoading && !profileCreationOpen}
    전환 중
  {/if}

  {#if profileError}
    {profileError}
  {/if}

  {#if profileCreationError}
    {profileCreationError}
  {/if}
</section>
