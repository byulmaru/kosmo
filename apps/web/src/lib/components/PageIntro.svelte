<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    description,
    tone = 'muted',
    children,
  }: {
    title: string;
    description: string;
    tone?: 'primary' | 'muted';
    children?: Snippet;
  } = $props();
</script>

<section class="w-[min(100%,36rem)]">
  <p
    class={`mb-3 text-xs font-semibold tracking-[1.6px] uppercase ${tone === 'primary' ? 'text-primary' : 'text-muted-foreground'}`}
  >
    KOSMO
  </p>
  <h1 class="text-foreground m-0 text-5xl leading-[44px] font-bold">{title}</h1>
  <span class="text-secondary-foreground mt-3 block max-w-90 text-base leading-6"
    >{description}</span
  >
  {#if children}
    {@render children()}
  {/if}
</section>
