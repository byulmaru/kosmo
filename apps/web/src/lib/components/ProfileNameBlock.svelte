<script lang="ts">
  import { graphql } from '$mearie';
  import type { ProfileNameBlock_profile$key } from '$mearie';
  import { createFragment } from '@mearie/svelte';
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements';

  import { tv } from '$lib/tv';

  // 프로필 이름 블록(displayName + @handle). Figma UserInfo/NameBlock에 대응한다.
  // 게시글 작성자뿐 아니라 작성 화면의 현재 사용자에도 쓰인다. 아바타·거터·본문 배치 같은
  // 게시글 레이아웃은 `PostLayout`이 담당하므로 여기에는 두지 않는다.
  type ProfileNameBlockBaseProps = {
    profile: ProfileNameBlock_profile$key;
    // Svelte의 ClassValue(숫자·딕셔너리 포함)는 tailwind-merge가 받지 못하므로
    // 문자열로 좁힌다.
    class?: string | null;
  };

  type ProfileNameBlockLinkProps = Omit<HTMLAnchorAttributes, 'href'> &
    ProfileNameBlockBaseProps & {
      href: string;
    };

  type ProfileNameBlockStaticProps = HTMLAttributes<HTMLDivElement> &
    ProfileNameBlockBaseProps & {
      href?: undefined;
    };

  type ProfileNameBlockProps = ProfileNameBlockLinkProps | ProfileNameBlockStaticProps;

  let props: ProfileNameBlockProps = $props();

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
      fragment ProfileNameBlock_profile on Profile {
        id
        displayName
        handle
      }
    `),
    () => props.profile,
  );

  const profileNameBlock = tv({
    slots: {
      nameBlock:
        'group block min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-more',
      displayName: 'text-text-primary text-md block truncate font-bold',
      handle: 'text-text-secondary block truncate text-sm',
    },
    variants: {
      link: {
        true: { displayName: 'group-hover:underline' },
      },
    },
  });

  const slots = $derived(profileNameBlock({ link: Boolean(props.href) }));
</script>

{#if props.href}
  <a {...anchorAttributes} href={props.href} class={slots.nameBlock({ class: props.class })}>
    <span class={slots.displayName()}>
      {profileFragment.data.displayName}
    </span>
    <span class={slots.handle()}>
      @{profileFragment.data.handle}
    </span>
  </a>
{:else}
  <div {...divAttributes} class={slots.nameBlock({ class: props.class })}>
    <span class={slots.displayName()}>
      {profileFragment.data.displayName}
    </span>
    <span class={slots.handle()}>
      @{profileFragment.data.handle}
    </span>
  </div>
{/if}
