<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  type FieldState = 'default' | 'focused' | 'error';

  type TextAreaProps = HTMLTextareaAttributes & {
    state?: FieldState;
  };

  let { state = 'default', class: className = '', ...rest }: TextAreaProps = $props();

  const stateClass: Record<FieldState, string> = {
    default: 'border-border',
    focused: 'border-primary',
    error: 'border-danger',
  };
</script>

<textarea
  {...rest}
  aria-invalid={state === 'error' ? 'true' : undefined}
  data-state={state}
  class={`bg-card text-text-primary placeholder:text-text-secondary h-24 w-[17.5rem] resize-none rounded-[8px] border px-3 py-3 text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-more disabled:cursor-not-allowed disabled:opacity-45 ${stateClass[state]} ${className}`}
></textarea>
