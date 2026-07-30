import assert from 'node:assert/strict';
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
};

let fragmentData: ProfileData;
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Link: ({ children, href }: { children: ReturnType<typeof createElement>; href: string }) =>
    createElement('Link', { href }, children),
});
mockModule('react-native', {
  Image: 'Image',
  Pressable: 'Pressable',
  StyleSheet: {
    absoluteFillObject: {},
    create: <T>(styles: T) => styles,
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
    background: '#ffffff',
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

let ProfileHero: typeof ProfileHeroExport;

before(async () => {
  ({ ProfileHero } = await import('./ProfileHero'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
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
};

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

  it('URL이 없으면 Image를 렌더하지 않는다', async () => {
    await renderProfile({
      ...baseProfile,
      avatar: { id: 'media-avatar', url: null },
      header: { id: 'media-header', url: null },
    });

    assert.deepEqual(
      renderer!.root.findAll((node) => (node.type as unknown) === 'Image'),
      [],
    );
  });
});
