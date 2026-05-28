<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import UserRow from './UserRow.svelte';

  type UserSearchResultRowProps = HTMLAttributes<HTMLDivElement> & {
    state?: 'follow' | 'following';
    name?: string;
    handle?: string;
    bio?: string;
  };

  let {
    state = 'follow',
    name = '사용자 이름',
    handle = '@user@kos.moe',
    bio = '한 줄 소개가 들어가는 자리',
    ...rest
  }: UserSearchResultRowProps = $props();
</script>

<UserRow {...rest} {state} {name} {handle} {bio} width="wide" />
