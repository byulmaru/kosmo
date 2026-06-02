<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import ProfileHero from './ProfileHero.svelte';

  const sampleProfile = {
    handle: 'user@kos.moe',
    displayName: '표시 이름',
    bio: '본문 한 줄이 들어가는 자리예요. 내용이 길어지면 여러 줄로 늘어나요.',
    followersCount: 128,
    followingCount: 1234,
  };

  const { Story } = defineMeta({
    title: 'KOSMO/ProfileHero',
    component: ProfileHero,
    parameters: {
      layout: 'fullscreen',
    },
  });
</script>

<Story name="Default" args={{ profile: sampleProfile }} />
<Story name="No bio" args={{ profile: { ...sampleProfile, bio: null } }} />
<Story name="Loading" args={{ loading: true }} />
