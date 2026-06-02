<script lang="ts">
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

  import Avatar from './Avatar.svelte';

  type PostAuthorProfileViewBaseProps = {
    displayName: string;
    handle: string;
  };

  type PostAuthorProfileViewLinkProps = Omit<HTMLAnchorAttributes, 'href'> &
    PostAuthorProfileViewBaseProps & {
      href: string;
    };

  type PostAuthorProfileViewStaticProps = HTMLAttributes<HTMLDivElement> &
    PostAuthorProfileViewBaseProps & {
      href?: undefined;
    };

  type PostAuthorProfileViewProps =
    | PostAuthorProfileViewLinkProps
    | PostAuthorProfileViewStaticProps;

  let props: PostAuthorProfileViewProps = $props();

  const normalizedHandle = $derived(
    props.handle.startsWith('@') ? props.handle : `@${props.handle}`,
  );
  const initials = $derived(
    (props.displayName.trim() || props.handle.trim()).slice(0, 1).toUpperCase(),
  );
  const anchorAttributes = $derived.by(() => {
    if (!props.href) {
      return {} as Omit<HTMLAnchorAttributes, 'href'>;
    }

    const {
      displayName: _displayName,
      handle: _handle,
      href: _href,
      class: _className,
      ...attributes
    } = props;
    return attributes as Omit<HTMLAnchorAttributes, 'href'>;
  });
  const divAttributes = $derived.by(() => {
    if (props.href) {
      return {} as HTMLAttributes<HTMLDivElement>;
    }

    const {
      displayName: _displayName,
      handle: _handle,
      href: _href,
      class: _className,
      ...attributes
    } = props;
    return attributes as HTMLAttributes<HTMLDivElement>;
  });
  const contentClass =
    'group flex min-w-0 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-more';
</script>

{#if props.href}
  <a {...anchorAttributes} href={props.href} class={`${contentClass} ${props.class ?? ''}`}>
    <Avatar size="sm" {initials} />
    <span class="min-w-0 flex-1">
      <span class="text-text-primary block truncate text-sm font-bold group-hover:underline">
        {props.displayName}
      </span>
      <span class="text-text-secondary block truncate text-xs">{normalizedHandle}</span>
    </span>
  </a>
{:else}
  <div {...divAttributes} class={`${contentClass} ${props.class ?? ''}`}>
    <Avatar size="sm" {initials} />
    <span class="min-w-0 flex-1">
      <span class="text-text-primary block truncate text-sm font-bold">{props.displayName}</span>
      <span class="text-text-secondary block truncate text-xs">{normalizedHandle}</span>
    </span>
  </div>
{/if}
