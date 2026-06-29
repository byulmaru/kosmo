<script lang="ts">
  import { createFragment } from '@mearie/svelte';
  import { graphql } from '$mearie';
  import TextSkeleton from '$lib/components/TextSkeleton.svelte';
  import { formatCount, getProfileInitial } from '$lib/utils/profile';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { Snippet } from 'svelte';

  // 프로필 헤더(커버+아바타+이름+핸들+바이오+카운트). Figma ProfileHero(560:515)의 데이터-가용 subset.
  // 우측 상단 action 슬롯은 라우트가 채운다(현재 팔로우 버튼, PROD-96). 태그칩/ProfileMeta/편집 버튼은 아직 범위 밖.
  type Props = {
    profile?: FragmentRefs<'ProfileHero_profile'> | null;
    loading?: boolean;
    action?: Snippet;
  };

  let { profile = null, loading = false, action }: Props = $props();

  const fragment = createFragment(
    graphql(`
      fragment ProfileHero_profile on Profile {
        handle
        relativeHandle
        displayName
        bio
        followersCount
        followingCount
      }
    `),
    () => profile,
  );
</script>

{#if loading}
  <div aria-hidden="true">
    <div class="bg-surface h-[104px] w-full animate-pulse"></div>
    <div class="px-4">
      <div class="border-bg bg-surface -mt-10 size-20 animate-pulse rounded-full border-4"></div>
      <div class="mt-4 flex flex-col gap-2.5">
        <TextSkeleton width="md" class="h-5" />
        <TextSkeleton width="sm" />
        <TextSkeleton width="lg" class="mt-2" />
      </div>
    </div>
  </div>
  <span class="sr-only" role="status">프로필을 불러오는 중입니다.</span>
{:else if fragment.data}
  <header class="mb-6">
    <div class="bg-primary h-[104px] w-full"></div>
    <div class="px-4">
      <div class="flex items-start justify-between">
        <div
          class="border-bg bg-surface text-text-secondary -mt-10 flex size-20 items-center justify-center rounded-full border-4 text-3xl font-bold"
        >
          {getProfileInitial(fragment.data.displayName, fragment.data.handle)}
        </div>
        {#if action}
          <div class="mt-3">{@render action()}</div>
        {/if}
      </div>
      <h1 class="text-text-primary mt-3 text-2xl font-bold break-words">
        {fragment.data.displayName}
      </h1>
      <p class="text-text-secondary text-sm break-words">{fragment.data.relativeHandle}</p>
      {#if fragment.data.bio}
        <p class="text-text-primary mt-3 text-base break-words whitespace-pre-wrap">
          {fragment.data.bio}
        </p>
      {/if}
      <div class="mt-3 flex items-center gap-4 text-sm">
        <a
          class="text-text-secondary border-b border-transparent hover:border-current"
          href={`/@${fragment.data.handle}/following`}
        >
          <span class="text-text-primary font-bold"
            >{formatCount(fragment.data.followingCount)}</span
          >
          팔로잉
        </a>
        <a
          class="text-text-secondary border-b border-transparent hover:border-current"
          href={`/@${fragment.data.handle}/followers`}
        >
          <span class="text-text-primary font-bold"
            >{formatCount(fragment.data.followersCount)}</span
          >
          팔로워
        </a>
      </div>
    </div>
  </header>
{/if}
