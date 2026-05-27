<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  type FieldState = 'default' | 'focused' | 'error';

  type TextFieldProps = Omit<HTMLInputAttributes, 'size'> & {
    state?: FieldState;
  };

  let { state = 'default', class: className = '', ...rest }: TextFieldProps = $props();

  const stateClass: Record<FieldState, string> = {
    default: 'border-border',
    focused: 'border-primary',
    error: 'border-destructive',
  };
</script>

<input
  {...rest}
  aria-invalid={state === 'error' ? 'true' : undefined}
  data-state={state}
  class={`bg-card text-foreground placeholder:text-muted-foreground h-11 w-[17.5rem] rounded-[8px] border px-3 text-sm outline-none transition-colors focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 ${stateClass[state]} ${className}`}
/>
