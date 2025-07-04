<script lang="ts">
  import { Button } from '../ui/button';
  import type { Snippet } from 'svelte';
  import type { ButtonProps } from '../ui/button';

  type Props = {
    children: Snippet;
  } & ButtonProps;

  const { children, ...restProps }: Props = $props();
</script>

<Button type="submit" {...restProps}>
  {@render children()}
</Button>
