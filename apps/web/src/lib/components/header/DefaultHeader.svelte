<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    showBackButton?: boolean;
    titleSnippet?: Snippet;
    actionsSnippet?: Snippet;
  }

  const { title = '', showBackButton = true, titleSnippet, actionsSnippet }: Props = $props();

  function handleBack() {
    if (browser) {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        goto('/');
      }
    }
  }

  function scrollToTop() {
    if (browser) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
</script>

<header
  class="bg-background/80 sticky top-0 z-50 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-md"
>
  {#if showBackButton}
    <Button class="shrink-0" onclick={handleBack} size="icon" variant="ghost">
      <ArrowLeft class="size-5" />
    </Button>
  {/if}

  <button
    class="flex h-full flex-1 cursor-pointer flex-row items-center"
    onclick={scrollToTop}
    type="button"
  >
    {#if title}
      <h1 class="truncate align-middle font-semibold">{title}</h1>
    {:else if titleSnippet}
      {@render titleSnippet()}
    {/if}
  </button>

  <div class="flex items-center gap-2">
    {#if actionsSnippet}
      {@render actionsSnippet()}
    {/if}
  </div>
</header>
