<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import UserRow from './UserRow.svelte';

  type AccountResultRowProps = HTMLAttributes<HTMLDivElement> & {
    state?: 'follow' | 'following';
  };

  let { state = 'follow', ...rest }: AccountResultRowProps = $props();
</script>

<UserRow {...rest} {state} width="wide" handle="@user@kos.moe" meta="#그림 #팬아트 #체인소맨" />
