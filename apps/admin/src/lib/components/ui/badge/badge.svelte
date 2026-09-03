<script lang="ts">
  import { tv } from 'tailwind-variants';
  import type { Snippet } from 'svelte';
  import type { VariantProps } from 'tailwind-variants';

  const variants = tv({
    base: 'inline-flex h-5 w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium',
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  });

  let {
    children,
    variant = 'default',
  }: {
    children: Snippet;
    variant?: VariantProps<typeof variants>['variant'];
  } = $props();
</script>

<span class={variants({ variant })}>{@render children()}</span>
