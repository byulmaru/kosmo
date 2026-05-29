<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import AccountResultRow from './AccountResultRow.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/AccountResultRow',
    component: AccountResultRow,
    tags: ['autodocs'],
    argTypes: {
      state: {
        control: 'radio',
        options: ['follow', 'following'],
      },
    },
  });
</script>

<Story name="Follow" args={{ state: 'follow' }} />
<Story name="Following" args={{ state: 'following' }} />
