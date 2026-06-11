<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

  import Button from '../Button.svelte';

  let {
    ref = $bindable(null),
    child: childSnippet,
    children,
    ...restProps
  }: DropdownMenuPrimitive.TriggerProps = $props();
</script>

{#if childSnippet}
  <DropdownMenuPrimitive.Trigger
    bind:ref
    data-slot="dropdown-menu-trigger"
    child={childSnippet}
    {...restProps}
  />
{:else}
  <DropdownMenuPrimitive.Trigger bind:ref data-slot="dropdown-menu-trigger" {...restProps}>
    {#snippet child({ props })}
      <Button variant="secondary" {...props}>
        {@render children?.()}
      </Button>
    {/snippet}
  </DropdownMenuPrimitive.Trigger>
{/if}
