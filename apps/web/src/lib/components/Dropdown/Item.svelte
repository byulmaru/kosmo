<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
  import { cn, tv, type VariantProps } from 'tailwind-variants';

  const dropdownItem = tv({
    base: 'text-text-primary flex w-full cursor-default items-start gap-2 rounded-sm px-3 py-2.5 text-left text-sm transition-colors outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
    variants: {
      active: {
        true: 'bg-primary/45 hover:bg-primary/55 focus:bg-primary/55 data-[highlighted]:bg-primary/55',
        false: 'bg-card hover:bg-surface focus:bg-surface data-[highlighted]:bg-surface',
      },
    },
    defaultVariants: {
      active: false,
    },
  });

  type Props = DropdownMenuPrimitive.ItemProps & VariantProps<typeof dropdownItem>;

  let { ref = $bindable(null), active = false, class: className, ...restProps }: Props = $props();
</script>

<DropdownMenuPrimitive.Item
  bind:ref
  data-slot="dropdown-menu-item"
  data-active={active ? '' : undefined}
  class={cn(dropdownItem({ active }), className)}
  {...restProps}
/>
