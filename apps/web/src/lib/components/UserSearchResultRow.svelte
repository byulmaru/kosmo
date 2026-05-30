<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import UserRow from './UserRow.svelte';

  type UserSearchResultRowProps = HTMLAttributes<HTMLDivElement> & {
    state?: 'follow' | 'following';
  };

  let { state = 'follow', ...rest }: UserSearchResultRowProps = $props();
</script>

<UserRow {...rest} {state} width="wide" handle="@user@kos.moe" bio="한 줄 소개가 들어가는 자리" />
