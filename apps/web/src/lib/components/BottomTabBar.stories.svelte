<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import type { BottomTabBar_profile$key } from '$mearie';

  import BottomTabBar from './BottomTabBar.svelte';

  const pageState = (path: string) => ({
    url: new URL(`https://kosmo.local${path}`),
    params: {},
    route: { id: path === '/' ? '/(tabs)' : `/(tabs)${path}` },
    status: 200,
    error: null,
    data: {},
    form: null,
  });

  const storyParameters = (path: string) => ({
    layout: 'fullscreen',
    sveltekit_experimental: {
      state: {
        page: pageState(path),
      },
    },
  });

  const selectedProfile = {
    handle: 'kosmo',
    displayName: '코스모',
  } as unknown as BottomTabBar_profile$key;

  const { Story } = defineMeta({
    title: 'KOSMO/BottomTab',
    component: BottomTabBar,
    globals: {
      viewport: { value: 'mobile1', isRotated: false },
    },
    parameters: {
      layout: 'fullscreen',
    },
  });
</script>

<Story name="Home active" args={{ selectedProfile }} parameters={storyParameters('/home')} />
<Story name="Search active" args={{ selectedProfile }} parameters={storyParameters('/search')} />
<Story name="Compose active" args={{ selectedProfile }} parameters={storyParameters('/compose')} />
<Story
  name="Notifications active"
  args={{ selectedProfile }}
  parameters={storyParameters('/notifications')}
/>
<Story name="Profile active" args={{ selectedProfile }} parameters={storyParameters('/@kosmo')} />
<Story
  name="No selected profile"
  args={{ selectedProfile: null }}
  parameters={storyParameters('/home')}
/>
