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

  const defaultArgs = {
    name: '사용자 이름',
    handle: '@user@kos.moe',
    meta: '#그림 #팬아트 #체인소맨',
  };
</script>

<Story name="Follow" args={{ ...defaultArgs, state: 'follow' }} />
<Story name="Following" args={{ ...defaultArgs, state: 'following' }} />
