<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

  import Avatar from './Avatar.svelte';

  // 게시글 작성자 영역. Figma ThreadPost(702:6286) 구조를 따라 좌측 거터(아바타,
  // 이후 스레드 라인이 그려질 자리)와 우측 콘텐츠 컬럼으로 나뉜다.
  // children은 콘텐츠 컬럼에서 이름 블록 아래에 렌더된다(게시글 본문 등).
  // 거터 폭은 아바타 크기를 따른다: 디테일(ThreadPost)은 md(40px),
  // 목록(PostCard 67:206)은 lg(48px).
  type PostAuthorProfileBaseProps = {
    profile: FragmentRefs<'PostAuthorProfile_profile'>;
    avatarSize?: 'md' | 'lg';
    // 이름 블록과 같은 행 우측에 렌더된다(목록의 작성 시간 등).
    trailing?: Snippet;
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
      avatarSize: _avatarSize,
      trailing: _trailing,
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
      avatarSize: _avatarSize,
      trailing: _trailing,
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
  <div class={`flex shrink-0 flex-col self-stretch ${props.avatarSize === 'lg' ? 'w-12' : 'w-10'}`}>
    {#if props.href}
      <!-- 이름 블록 링크와 목적지가 같으므로 탭 순서·스크린리더에서는 숨긴다. -->
      <a href={props.href} tabindex="-1" aria-hidden="true">
        <Avatar size={props.avatarSize ?? 'md'} initials={getInitials()} />
      </a>
    {:else}
      <Avatar size={props.avatarSize ?? 'md'} initials={getInitials()} />
    {/if}
  </div>
  <div class="min-w-0 flex-1">
    <div class="flex items-start justify-between gap-2">
      {#if props.href}
        <a {...anchorAttributes} href={props.href} class={`flex-1 ${nameBlockClass}`}>
          <span class="text-text-primary text-md block truncate font-bold group-hover:underline">
            {profileFragment.data.displayName}
          </span>
          <span class="text-text-secondary block truncate text-sm">
            @{profileFragment.data.handle}
          </span>
        </a>
      {:else}
        <div {...divAttributes} class={`flex-1 ${nameBlockClass}`}>
          <span class="text-text-primary text-md block truncate font-bold">
            {profileFragment.data.displayName}
          </span>
          <span class="text-text-secondary block truncate text-sm">
            @{profileFragment.data.handle}
          </span>
        </div>
      {/if}
      {#if props.trailing}
        <div class="shrink-0">
          {@render props.trailing()}
        </div>
      {/if}
    </div>
    {@render props.children?.()}
  </div>
</div>
