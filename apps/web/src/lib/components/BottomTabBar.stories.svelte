<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

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

  const { Story } = defineMeta({
    title: 'KOSMO/BottomTab',
    component: BottomTabBar,
    parameters: {
      layout: 'fullscreen',
    },
  });
</script>

<Story name="Home active" parameters={storyParameters('/')} />
<Story name="Search active" parameters={storyParameters('/search')} />
<Story name="Compose active" parameters={storyParameters('/compose')} />
