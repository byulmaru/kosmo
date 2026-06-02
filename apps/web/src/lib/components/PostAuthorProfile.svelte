<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

  import PostAuthorProfileView from './PostAuthorProfileView.svelte';

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
</script>

{#if props.href}
  <PostAuthorProfileView
    {...anchorAttributes}
    {displayName}
    {handle}
    href={props.href}
    class={props.class ?? ''}
  />
{:else}
  <PostAuthorProfileView {...divAttributes} {displayName} {handle} class={props.class ?? ''} />
{/if}
