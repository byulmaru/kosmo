<script lang="ts">
  import { graphql } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { FragmentRefs } from '@mearie/svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

  import { tv } from '$lib/tv';

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
    // Svelte의 ClassValue(숫자·딕셔너리 포함)는 tailwind-merge가 받지 못하므로
    // 문자열로 좁힌다.
    class?: string | null;
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

  const postAuthorProfile = tv({
    slots: {
      root: 'flex items-start gap-3',
      gutter: 'flex shrink-0 flex-col self-stretch',
      content: 'min-w-0 flex-1',
      header: 'flex items-start justify-between gap-2',
      nameBlock:
        'group block min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-more',
      displayName: 'text-text-primary text-md block truncate font-bold',
      handle: 'text-text-secondary block truncate text-sm',
      trailing: 'shrink-0',
    },
    variants: {
      avatarSize: {
        md: { gutter: 'w-10' },
        lg: { gutter: 'w-12' },
      },
      link: {
        true: { displayName: 'group-hover:underline' },
      },
    },
    defaultVariants: {
      avatarSize: 'md',
    },
  });

  const slots = $derived(
    postAuthorProfile({ avatarSize: props.avatarSize, link: Boolean(props.href) }),
  );
</script>

<div class={slots.root({ class: props.class })}>
  <div class={slots.gutter()}>
    {#if props.href}
      <!-- 이름 블록 링크와 목적지가 같으므로 탭 순서·스크린리더에서는 숨긴다. -->
      <a href={props.href} tabindex="-1" aria-hidden="true">
        <Avatar size={props.avatarSize ?? 'md'} initials={getInitials()} />
      </a>
    {:else}
      <Avatar size={props.avatarSize ?? 'md'} initials={getInitials()} />
    {/if}
  </div>
  <div class={slots.content()}>
    <div class={slots.header()}>
      {#if props.href}
        <a {...anchorAttributes} href={props.href} class={slots.nameBlock()}>
          <span class={slots.displayName()}>
            {profileFragment.data.displayName}
          </span>
          <span class={slots.handle()}>
            @{profileFragment.data.handle}
          </span>
        </a>
      {:else}
        <div {...divAttributes} class={slots.nameBlock()}>
          <span class={slots.displayName()}>
            {profileFragment.data.displayName}
          </span>
          <span class={slots.handle()}>
            @{profileFragment.data.handle}
          </span>
        </div>
      {/if}
      {#if props.trailing}
        <div class={slots.trailing()}>
          {@render props.trailing()}
        </div>
      {/if}
    </div>
    {@render props.children?.()}
  </div>
</div>
