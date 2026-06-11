<script lang="ts">
  import { cn } from 'tailwind-variants';
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

  type Props = DropdownMenuPrimitive.ItemProps & {
    active?: boolean;
  };

  let { ref = $bindable(null), active = false, class: className, ...restProps }: Props = $props();
</script>

<DropdownMenuPrimitive.Item
  bind:ref
  data-slot="dropdown-menu-item"
  data-active={active ? '' : undefined}
  class={cn(
    'text-text-primary flex w-full cursor-default items-start gap-2 rounded-sm bg-card px-3 py-2.5 text-left text-sm transition-colors outline-none hover:bg-surface focus:bg-surface data-[active]:bg-primary/45 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface hover:data-[active]:bg-primary/55 focus:data-[active]:bg-primary/55 data-[highlighted]:data-[active]:bg-primary/55',
    className,
  )}
  {...restProps}
/>
