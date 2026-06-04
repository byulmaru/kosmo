<script lang="ts">
  import Button from './Button.svelte';

  export type ProfileFollowState = 'ACCEPTED' | 'PENDING' | 'REJECTED';

  export type ViewerFollow = {
    id: string;
    state: ProfileFollowState;
  };

  type Props = {
    hidden?: boolean;
    label: string;
    variant: 'primary' | 'secondary';
    disabled?: boolean;
    loading?: boolean;
    pressed?: boolean;
    message?: string | null;
    messageRole?: 'alert' | 'status';
    size?: 'sm' | 'md' | 'lg';
    class?: string;
    onclick: () => void;
  };

  let {
    hidden = false,
    label,
    variant,
    disabled = false,
    loading = false,
    pressed = false,
    message = null,
    messageRole,
    size = 'sm',
    class: className = '',
    onclick,
  }: Props = $props();
</script>

{#if !hidden}
  <div class={`inline-flex flex-col items-start gap-1 ${className}`}>
    <Button {variant} {size} {disabled} aria-busy={loading} aria-pressed={pressed} {onclick}>
      {label}
    </Button>
    {#if message}
      <p class="text-text-secondary m-0 max-w-56 text-xs leading-4" role={messageRole}>
        {message}
      </p>
    {/if}
  </div>
{/if}
