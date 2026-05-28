<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import UserRow from './UserRow.svelte';

  type AccountResultRowProps = HTMLAttributes<HTMLDivElement> & {
    state?: 'follow' | 'following';
    name?: string;
    handle?: string;
    meta?: string;
  };

  let {
    state = 'follow',
    name = '사용자 이름',
    handle = '@user@kos.moe',
    meta = '#그림 #팬아트 #체인소맨',
    ...rest
  }: AccountResultRowProps = $props();
</script>

<UserRow {...rest} {state} {name} {handle} {meta} width="wide" />
