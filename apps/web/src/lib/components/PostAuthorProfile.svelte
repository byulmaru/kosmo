<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import Avatar from './Avatar.svelte';

  type PostAuthorProfileProps = HTMLAttributes<HTMLElement> & {
    displayName: string;
    handle: string;
    avatarUrl?: string | null;
    href?: string;
  };

  let {
    displayName,
    handle,
    avatarUrl = null,
    href,
    class: className = '',
    ...rest
  }: PostAuthorProfileProps = $props();

  const normalizedHandle = $derived(handle.startsWith('@') ? handle : `@${handle}`);
  const initials = $derived((displayName.trim() || handle.trim()).slice(0, 1).toUpperCase());
  const contentClass =
    'group flex min-w-0 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-more';
</script>

{#if href}
  <a {...rest} {href} class={`${contentClass} ${className}`}>
    <Avatar
      size="sm"
      src={avatarUrl ?? undefined}
      alt={`${displayName} 프로필 이미지`}
      {initials}
    />
    <span class="min-w-0 flex-1">
      <span class="text-text-primary block truncate text-sm font-bold group-hover:underline">
        {displayName}
      </span>
      <span class="text-text-secondary block truncate text-xs">{normalizedHandle}</span>
    </span>
  </a>
{:else}
  <div {...rest} class={`${contentClass} ${className}`}>
    <Avatar
      size="sm"
      src={avatarUrl ?? undefined}
      alt={`${displayName} 프로필 이미지`}
      {initials}
    />
    <span class="min-w-0 flex-1">
      <span class="text-text-primary block truncate text-sm font-bold">{displayName}</span>
      <span class="text-text-secondary block truncate text-xs">{normalizedHandle}</span>
    </span>
  </div>
{/if}
