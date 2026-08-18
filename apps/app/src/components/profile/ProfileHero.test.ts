import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfileHero as ProfileHeroExport } from './ProfileHero';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ProfileData = {
  avatar: { id: string; url: string | null } | null;
  bio: string | null;
  displayName: string;
  followersCount: number;
  followingCount: number;
  handle: string;
  header: { id: string; url: string | null } | null;
  relativeHandle: string;
  tags: ReadonlyArray<{ id: string; name: string }>;
};

let fragmentData: ProfileData;
const platformSelections: Array<Record<string, number>> = [];
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  NavigationLink: ({
    children,
    href,
  }: {
    children: ReturnType<typeof createElement>;
    href: unknown;
  }) => createElement('NavigationLink', { href }, children),
});
mockModule('react-native', {
  Image: 'Image',
  Platform: {
    OS: 'web',
    select: (options: Record<string, number>) => {
      platformSelections.push(options);
      return options.web;
    },
  },
  Pressable: 'Pressable',
  StyleSheet: {
    absoluteFillObject: {},
    create: <T>(styles: T) => styles,
    flatten: (styles: ReadonlyArray<Record<string, unknown>>) => Object.assign({}, ...styles),
  },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => 'ProfileHero_profile',
  useFragment: () => fragmentData,
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({
    background: '#legacy-background',
    backgroundCanvas: '#semantic-canvas',
    backgroundSurface: '#semantic-surface',
    border: '#dddddd',
    primary: '#ffee99',
    surface: '#eeeeee',
    text: '#111111',
    textSecondary: '#666666',
  }),
});
mockModule(new URL('../ui/StateView.tsx', import.meta.url), {
  Skeleton: (props: object) => createElement('Skeleton', props),
});

const require = createRequire(import.meta.url);
require.extensions['.png'] = (module, filename) => {
  module.exports = filename;
};
mockModule(require.resolve('lucide-react-native'), { XIcon: 'XIcon' });

let ProfileHero: typeof ProfileHeroExport;

before(async () => {
  ({ ProfileHero } = await import('./ProfileHero'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platformSelections.length = 0;
});

const renderProfile = async (data: ProfileData) => {
  fragmentData = data;
  await act(async () => {
    renderer = create(createElement(ProfileHero, { profile: {} as never }));
  });
  assert.ok(renderer);
};

const baseProfile: ProfileData = {
  avatar: null,
  bio: '소개',
  displayName: '코스모',
  followersCount: 2,
  followingCount: 1,
  handle: 'kosmo',
  header: null,
  relativeHandle: '@kosmo',
  tags: [],
};

const findCoverStyle = () => {
  const cover = renderer!.root.find(
    (node) =>
      (node.type as unknown) === 'View' &&
      Array.isArray(node.props.style) &&
      node.props.style[0]?.width === '100%',
  );
  return cover.props.style[0];
};

describe('ProfileHero cover geometry', () => {
  it('data/no-header branch uses the shared 3:1 cover geometry', async () => {
    await renderProfile(baseProfile);

    assert.deepEqual(findCoverStyle(), { aspectRatio: 3, width: '100%' });
  });

  it('loading branch uses the shared 3:1 cover geometry', async () => {
    await act(async () => {
      renderer = create(createElement(ProfileHero, { loading: true }));
    });
    assert.ok(renderer);

    assert.deepEqual(findCoverStyle(), { aspectRatio: 3, width: '100%' });
  });

  it('loading branch uses the semantic surface and canvas roles', async () => {
    await act(async () => {
      renderer = create(createElement(ProfileHero, { loading: true }));
    });
    assert.ok(renderer);

    const cover = renderer.root.find(
      (node) =>
        (node.type as unknown) === 'View' &&
        Array.isArray(node.props.style) &&
        node.props.style[0]?.width === '100%',
    );
    const avatar = renderer.root.find(
      (node) => (node.type as unknown) === 'Skeleton' && node.props.circular === true,
    );

    assert.equal(cover.props.style[1].backgroundColor, '#semantic-surface');
    assert.equal(avatar.props.style[1].borderColor, '#semantic-canvas');
  });
});

describe('ProfileHero media presentation', () => {
  it('header와 avatar URL을 각각 cover 이미지로 렌더한다', async () => {
    await renderProfile({
      ...baseProfile,
      avatar: { id: 'media-avatar', url: 'https://media.example/avatar.webp' },
      header: { id: 'media-header', url: 'https://media.example/header.webp' },
    });

    const images = renderer!.root.findAll((node) => (node.type as unknown) === 'Image');
    assert.deepEqual(
      images.map((node) => node.props.source),
      [{ uri: 'https://media.example/header.webp' }, { uri: 'https://media.example/avatar.webp' }],
    );
    assert.ok(images.every((node) => node.props.resizeMode === 'cover'));
  });

  it('URL이 없으면 승인된 기본 아바타 asset을 렌더한다', async () => {
    await renderProfile(baseProfile);

    const images = renderer!.root.findAll((node) => (node.type as unknown) === 'Image');
    assert.equal(images.length, 1);
    assert.match(String((images[0]!.props.source as { uri?: string }).uri), /default-avatar\.png$/);
  });
});

describe('ProfileHero Profile Tag presentation', () => {
  it('빈 Profile Tag 목록은 섹션을 렌더하지 않는다', async () => {
    await renderProfile(baseProfile);

    assert.equal(renderer!.root.findAllByProps({ testID: 'profile-tag-list' }).length, 0);
  });

  it('Profile Tag를 bio 다음과 통계 전에 exact Hashtag link로 표시한다', async () => {
    await renderProfile({
      ...baseProfile,
      tags: [
        { id: 'hashtag-fediverse', name: 'Fediverse' },
        { id: 'hashtag-development', name: '개발' },
      ],
    });

    const tagList = renderer!.root.findByProps({ testID: 'profile-tag-list' });
    assert.equal(tagList.props.style.flexDirection, 'row');
    assert.equal(tagList.props.style.flexWrap, 'wrap');
    const links = tagList.findAll((node) => (node.type as unknown) === 'NavigationLink');
    const targets = tagList.findAll((node) => (node.type as unknown) === 'Pressable');
    assert.deepEqual(
      links.map((node) => node.props.href),
      [
        {
          params: { hashtagId: 'hashtag-fediverse' },
          pathname: '/hashtags/[hashtagId]/profiles',
        },
        {
          params: { hashtagId: 'hashtag-development' },
          pathname: '/hashtags/[hashtagId]/profiles',
        },
      ],
    );
    assert.deepEqual(
      targets.map((node) => ({
        label: node.props.accessibilityLabel,
        role: node.props.accessibilityRole,
        target: {
          height: node.props.style.minHeight,
          width: node.props.style.minWidth,
        },
      })),
      [
        {
          label: '#Fediverse 관련 프로필 보기',
          role: 'link',
          target: { height: 32, width: 32 },
        },
        {
          label: '#개발 관련 프로필 보기',
          role: 'link',
          target: { height: 32, width: 32 },
        },
      ],
    );
    assert.deepEqual(platformSelections, [
      { android: 48, default: 48, ios: 44, web: 32 },
      { android: 48, default: 48, ios: 44, web: 32 },
    ]);

    const text = renderer!.root
      .findAll((node) => (node.type as unknown) === 'Text')
      .map((node) => node.children.join(''));
    const bioIndex = text.indexOf('소개');
    const fediverseIndex = text.indexOf('#Fediverse');
    const developmentIndex = text.indexOf('#개발');
    const followingIndex = text.indexOf('팔로잉');
    assert.ok(bioIndex < fediverseIndex);
    assert.ok(bioIndex < developmentIndex);
    assert.ok(fediverseIndex < followingIndex);
    assert.ok(developmentIndex < followingIndex);
  });
});
