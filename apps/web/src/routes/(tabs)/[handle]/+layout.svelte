<script lang="ts">
  import { page } from '$app/state';
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';

  let { children } = $props();

  const getInitial = (name?: string, handle?: string) =>
    (name || handle || '?').slice(0, 1).toUpperCase();

  const query = createQuery(
    graphql(`
      query ProfileLayoutQuery($handle: String!) {
        profileByHandle(handle: $handle) {
          id
          handle
          displayName
          bio
          followersCount
          followingCount
        }
      }
    `),
    () => ({ handle: page.params.handle }),
  );

  const profile = $derived(query.data?.profileByHandle ?? null);
</script>

<section class="w-[min(100%,36rem)]">
  {#if query.loading}
    <p class="text-text-secondary text-base">프로필을 불러오는 중입니다…</p>
  {:else if query.error}
    <p class="text-text-secondary text-base">프로필을 불러오지 못했습니다.</p>
  {:else if !profile}
    <p class="text-text-primary text-base font-semibold">프로필을 찾을 수 없습니다.</p>
  {:else}
    <header class="mb-6">
      <div class="bg-primary h-[104px] w-full rounded-lg"></div>
      <div class="px-1">
        <div
          class="border-bg bg-surface text-text-secondary -mt-10 flex size-20 items-center justify-center rounded-full border-4 text-3xl font-bold"
        >
          {getInitial(profile.displayName, profile.handle)}
        </div>
        <h1 class="text-text-primary mt-3 text-2xl font-bold">{profile.displayName}</h1>
        <p class="text-text-secondary text-sm">@{profile.handle}</p>
        {#if profile.bio}
          <p class="text-text-primary mt-3 text-base whitespace-pre-wrap">{profile.bio}</p>
        {/if}
      </div>
    </header>
    {@render children()}
  {/if}
</section>
