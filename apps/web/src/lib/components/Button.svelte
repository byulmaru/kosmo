<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type ButtonVariant = 'primary' | 'secondary' | 'text';
  type ButtonSize = 'sm' | 'md' | 'lg';

  type ButtonProps = HTMLButtonAttributes & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children?: Snippet;
  };

  let {
    variant = 'primary',
    size = 'md',
    type = 'button',
    children,
    class: className = '',
    ...rest
  }: ButtonProps = $props();

  const variantClass: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-text-primary hover:brightness-95',
    secondary: 'border border-border bg-card text-text-primary hover:bg-surface',
    text: 'bg-transparent text-text-primary hover:bg-surface',
  };

  const sizeClass: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-5 text-base',
  };
</script>

<button
  {...rest}
  {type}
  data-variant={variant}
  data-size={size}
  class={`inline-flex min-w-[7.5rem] items-center justify-center rounded-[8px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-more disabled:pointer-events-none disabled:opacity-45 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
>
  {#if children}
    {@render children()}
  {/if}
</button>
