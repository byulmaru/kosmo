<script lang="ts">
  import { page } from '$app/state';
  import { createQuery } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import TextSkeleton from '$lib/components/TextSkeleton.svelte';

  let { children } = $props();

  const getInitial = (name?: string, handle?: string) =>
    (name || handle || '?').slice(0, 1).toUpperCase();

  const countFormatter = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const formatCount = (count: number) => countFormatter.format(count).toLowerCase();

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
    <div aria-hidden="true">
      <div class="bg-surface h-[104px] w-full animate-pulse rounded-lg"></div>
      <div class="px-1">
        <div class="border-bg bg-surface -mt-10 size-20 animate-pulse rounded-full border-4"></div>
        <div class="mt-4 flex flex-col gap-2.5">
          <TextSkeleton width="md" class="h-5" />
          <TextSkeleton width="sm" />
          <TextSkeleton width="lg" class="mt-2" />
        </div>
      </div>
    </div>
    <span class="sr-only" role="status">프로필을 불러오는 중입니다.</span>
  {:else if query.error}
    <div class="py-12 text-center" role="alert">
      <p class="text-text-primary text-base font-semibold">프로필을 불러오지 못했어요</p>
      <p class="text-text-secondary mt-1 text-sm">잠시 후 다시 시도해주세요.</p>
      <button
        class="border-border text-text-primary mt-4 rounded-lg border px-4 py-2 text-sm font-bold"
        type="button"
        onclick={() => query.refetch()}
      >
        다시 시도
      </button>
    </div>
  {:else if !profile}
    <div class="py-12 text-center">
      <p class="text-text-primary text-base font-semibold">프로필을 찾을 수 없어요</p>
      <p class="text-text-secondary mt-1 text-sm">
        @{page.params.handle} 프로필이 존재하지 않아요.
      </p>
    </div>
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
        <div class="mt-3 flex items-center gap-4 text-sm">
          <span class="text-text-secondary">
            <span class="text-text-primary font-bold">{formatCount(profile.followersCount)}</span>
            팔로워
          </span>
          <span class="text-text-secondary">
            <span class="text-text-primary font-bold">{formatCount(profile.followingCount)}</span>
            팔로잉
          </span>
        </div>
      </div>
    </header>
    {@render children()}
  {/if}
</section>
