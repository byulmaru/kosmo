<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';

  import UserSearchResultRow from './UserSearchResultRow.svelte';

  const { Story } = defineMeta({
    title: 'KOSMO/UserSearchResultRow',
    component: UserSearchResultRow,
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
