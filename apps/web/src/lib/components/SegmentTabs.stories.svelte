<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import SegmentTabs from './SegmentTabs.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/SegmentTabs',
    component: SegmentTabs,
    tags: ['autodocs'],
    argTypes: {
      active: {
        control: 'radio',
        options: ['모두', '멘션'],
      },
    },
    parameters: {
      layout: 'centered',
    },
  });
</script>

<Story name="All" args={{ active: '모두' }} />
<Story name="Mentions" args={{ active: '멘션' }} />
