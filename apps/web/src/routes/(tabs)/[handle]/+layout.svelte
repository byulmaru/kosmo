<script lang="ts">
  import { page } from '$app/state';
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';

  let { children } = $props();

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
    <header class="mb-4">
      <h1 class="text-text-primary text-2xl font-bold">{profile.displayName}</h1>
      <p class="text-text-secondary text-sm">@{profile.handle}</p>
    </header>
    {@render children()}
  {/if}
</section>
