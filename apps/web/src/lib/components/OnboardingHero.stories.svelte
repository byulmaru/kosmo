<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import OnboardingHero from './OnboardingHero.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/OnboardingHero',
    component: OnboardingHero,
    tags: ['autodocs'],
  });
</script>

<Story name="Default" asChild>
  <OnboardingHero />
</Story>
