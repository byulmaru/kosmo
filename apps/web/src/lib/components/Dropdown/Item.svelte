<script lang="ts">
  import { cn } from 'tailwind-variants';
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

  type Props = DropdownMenuPrimitive.ItemProps & {
    selected?: boolean;
  };

  let { ref = $bindable(null), selected = false, class: className, ...restProps }: Props = $props();
</script>

<DropdownMenuPrimitive.Item
  bind:ref
  data-slot="dropdown-menu-item"
  data-selected={selected ? '' : undefined}
  class={cn(
    'text-text-primary flex w-full cursor-default items-start gap-2 rounded-sm px-3 py-2.5 text-left text-sm transition-colors outline-none hover:bg-surface focus:bg-surface data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface',
    selected ? 'bg-primary/45' : 'bg-card',
    className,
  )}
  {...restProps}
/>
