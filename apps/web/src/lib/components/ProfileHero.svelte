<script lang="ts">
  import TextSkeleton from '$lib/components/TextSkeleton.svelte';

  // 프로필 헤더(커버+아바타+이름+핸들+바이오+카운트). Figma ProfileHero(560:515)의 데이터-가용 subset.
  // 태그칩/ProfileMeta/팔로우·편집 버튼은 스키마·타 이슈(PROD-96 등) 범위라 아직 없음.
  type ProfileHeroData = {
    handle: string;
    displayName: string;
    bio?: string | null;
    followersCount: number;
    followingCount: number;
  };

  type Props = {
    profile?: ProfileHeroData | null;
    loading?: boolean;
  };

  let { profile = null, loading = false }: Props = $props();

  const getInitial = (name?: string, handle?: string) =>
    (name || handle || '?').slice(0, 1).toUpperCase();

  const countFormatter = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const formatCount = (count: number) => countFormatter.format(count).toLowerCase();
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
{:else if profile}
  <header class="mb-6">
    <div class="bg-primary h-[104px] w-full"></div>
    <div class="px-4">
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
{/if}
