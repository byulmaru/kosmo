<script lang="ts">
  import { goto } from '$app/navigation';
  import { graphql } from '$mearie';
  import { createQuery } from '@mearie/svelte';
  import Button from '$lib/components/Button.svelte';
  import PostComposer from '$lib/components/PostComposer.svelte';

  const query = createQuery(
    graphql(`
      query ComposePageQuery {
        currentSession {
          id
          selectedProfile {
            id
            ...PostComposer_profile
          }
        }
      }
    `),
  );

  const session = $derived(query.data?.currentSession ?? null);
  const selectedProfile = $derived(session?.selectedProfile ?? null);
</script>

<section class="grid w-[min(100%,36rem)] gap-5 self-start">
  <header>
    <p class="text-text-secondary mb-3 text-xs font-semibold tracking-[1.6px] uppercase">KOSMO</p>
    <h1 class="text-text-primary m-0 text-4xl leading-10 font-bold">글쓰기</h1>
  </header>

  {#if query.loading}
    <div class="border-border bg-card grid gap-3 rounded-md border p-4" aria-hidden="true">
      <div class="bg-surface h-5 w-36 animate-pulse rounded-sm"></div>
      <div class="bg-surface h-40 animate-pulse rounded-md"></div>
      <div class="flex justify-end">
        <div class="bg-surface h-10 w-30 animate-pulse rounded-sm"></div>
      </div>
    </div>
    <span class="sr-only" role="status">글쓰기 화면을 불러오는 중입니다.</span>
  {:else if query.error}
    <div class="border-border bg-card rounded-md border p-5" role="alert">
      <p class="text-text-primary m-0 text-base font-bold">글쓰기 정보를 불러오지 못했어요</p>
      <p class="text-text-secondary mt-1 mb-4 text-sm">잠시 후 다시 시도해주세요.</p>
      <Button variant="secondary" onclick={() => query.refetch()}>다시 시도</Button>
    </div>
  {:else if !session}
    <div class="border-border bg-card rounded-md border p-5">
      <p class="text-text-primary m-0 text-base font-bold">로그인이 필요해요</p>
      <p class="text-text-secondary mt-1 text-sm">게시글을 작성하려면 먼저 로그인해주세요.</p>
    </div>
  {:else if !selectedProfile}
    <div class="border-border bg-card rounded-md border p-5">
      <p class="text-text-primary m-0 text-base font-bold">프로필이 필요해요</p>
      <p class="text-text-secondary mt-1 mb-4 text-sm">
        홈에서 프로필을 만들거나 선택한 뒤 글을 쓸 수 있어요.
      </p>
      <Button variant="secondary" onclick={() => goto('/home')}>홈으로 이동</Button>
    </div>
  {:else}
    <PostComposer profile={selectedProfile} />
  {/if}
</section>
