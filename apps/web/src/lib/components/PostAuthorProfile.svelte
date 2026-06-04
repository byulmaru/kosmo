<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

  import Avatar from './Avatar.svelte';

  type PostAuthorProfileBaseProps = {
    profile: FragmentRefs<'PostAuthorProfile_profile'>;
  };

  type PostAuthorProfileLinkProps = Omit<HTMLAnchorAttributes, 'href'> &
    PostAuthorProfileBaseProps & {
      href: string;
    };

  type PostAuthorProfileStaticProps = HTMLAttributes<HTMLDivElement> &
    PostAuthorProfileBaseProps & {
      href?: undefined;
    };

  type PostAuthorProfileProps = PostAuthorProfileLinkProps | PostAuthorProfileStaticProps;

  let props: PostAuthorProfileProps = $props();

  const anchorAttributes = $derived.by(() => {
    if (!props.href) {
      return {} as Omit<HTMLAnchorAttributes, 'href'>;
    }

    const { profile: _profile, href: _href, class: _className, ...attributes } = props;
    return attributes as Omit<HTMLAnchorAttributes, 'href'>;
  });
  const divAttributes = $derived.by(() => {
    if (props.href) {
      return {} as HTMLAttributes<HTMLDivElement>;
    }

    const { profile: _profile, href: _href, class: _className, ...attributes } = props;
    return attributes as HTMLAttributes<HTMLDivElement>;
  });

  const profileFragment = createFragment(
    graphql(`
      fragment PostAuthorProfile_profile on Profile {
        displayName
        handle
      }
    `),
    () => props.profile,
  );

  const displayName = $derived(profileFragment.data.displayName);
  const handle = $derived(profileFragment.data.handle);
  const normalizedHandle = $derived(handle.startsWith('@') ? handle : `@${handle}`);
  const initials = $derived((displayName.trim() || handle.trim()).slice(0, 1).toUpperCase());
  const contentClass =
    'group flex min-w-0 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-more';
</script>

{#if props.href}
  <a {...anchorAttributes} href={props.href} class={`${contentClass} ${props.class ?? ''}`}>
    <Avatar size="sm" {initials} />
    <span class="min-w-0 flex-1">
      <span class="text-text-primary block truncate text-sm font-bold group-hover:underline">
        {displayName}
      </span>
      <span class="text-text-secondary block truncate text-xs">{normalizedHandle}</span>
    </span>
  </a>
{:else}
  <div {...divAttributes} class={`${contentClass} ${props.class ?? ''}`}>
    <Avatar size="sm" {initials} />
    <span class="min-w-0 flex-1">
      <span class="text-text-primary block truncate text-sm font-bold">{displayName}</span>
      <span class="text-text-secondary block truncate text-xs">{normalizedHandle}</span>
    </span>
  </div>
{/if}
