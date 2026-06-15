<script lang="ts">
  import OnboardingHero from '$lib/components/OnboardingHero.svelte';
</script>

<div class="flex min-h-screen flex-col">
  <header class="flex h-[84px] shrink-0 items-center px-12">
    <div class="flex items-center gap-2">
      <span
        class="bg-primary text-text-primary flex size-10 items-center justify-center rounded-md text-md font-bold"
      >
        K
      </span>
      <span class="text-text-primary text-md font-bold">KOSMO</span>
    </div>
  </header>
  <main class="flex flex-1 items-center px-12 lg:px-32">
    <OnboardingHero />
  </main>
</div>
