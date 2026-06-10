<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

  import Avatar from './Avatar.svelte';

  // 게시글 작성자 영역. Figma ThreadPost(702:6286) 구조를 따라 좌측 40px 거터(아바타,
  // 이후 스레드 라인이 그려질 자리)와 우측 콘텐츠 컬럼으로 나뉜다.
  // children은 콘텐츠 컬럼에서 이름 블록 아래에 렌더된다(게시글 본문 등).
  type PostAuthorProfileBaseProps = {
    profile: FragmentRefs<'PostAuthorProfile_profile'>;
    children?: Snippet;
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

    const {
      profile: _profile,
      href: _href,
      class: _className,
      children: _children,
      ...attributes
    } = props;
    return attributes as Omit<HTMLAnchorAttributes, 'href'>;
  });
  const divAttributes = $derived.by(() => {
    if (props.href) {
      return {} as HTMLAttributes<HTMLDivElement>;
    }

    const {
      profile: _profile,
      href: _href,
      class: _className,
      children: _children,
      ...attributes
    } = props;
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

  const getInitials = () =>
    (profileFragment.data.displayName.trim() || profileFragment.data.handle.trim())
      .slice(0, 1)
      .toUpperCase();
  const nameBlockClass =
    'group block min-w-0 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-more';
</script>

<div class={`flex items-start gap-3 ${props.class ?? ''}`}>
  <div class="flex w-10 shrink-0 flex-col self-stretch">
    {#if props.href}
      <!-- 이름 블록 링크와 목적지가 같으므로 탭 순서·스크린리더에서는 숨긴다. -->
      <a href={props.href} tabindex="-1" aria-hidden="true">
        <Avatar size="md" initials={getInitials()} />
      </a>
    {:else}
      <Avatar size="md" initials={getInitials()} />
    {/if}
  </div>
  <div class="min-w-0 flex-1">
    {#if props.href}
      <a {...anchorAttributes} href={props.href} class={nameBlockClass}>
        <span class="text-text-primary text-md block truncate font-bold group-hover:underline">
          {profileFragment.data.displayName}
        </span>
        <span class="text-text-secondary block truncate text-sm">
          @{profileFragment.data.handle}
        </span>
      </a>
    {:else}
      <div {...divAttributes} class={nameBlockClass}>
        <span class="text-text-primary text-md block truncate font-bold">
          {profileFragment.data.displayName}
        </span>
        <span class="text-text-secondary block truncate text-sm">
          @{profileFragment.data.handle}
        </span>
      </div>
    {/if}
    {@render props.children?.()}
  </div>
</div>
