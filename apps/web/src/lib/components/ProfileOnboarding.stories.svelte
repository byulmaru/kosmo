<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ProfileOnboarding from './ProfileOnboarding.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/ProfileOnboarding',
    component: ProfileOnboarding,
    tags: ['autodocs'],
    args: {
      hasProfiles: false,
      onAction: () => {},
    },
    argTypes: {
      hasProfiles: { control: 'boolean' },
    },
  });
</script>

<Story name="No profiles (create)" args={{ hasProfiles: false }} />

<Story name="Has profiles (select)" args={{ hasProfiles: true }} />
