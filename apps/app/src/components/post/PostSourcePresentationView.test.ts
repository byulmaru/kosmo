import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactElement } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  PostSourcePresentationView as PostSourcePresentationViewComponent,
  PostSourcePreview as PostSourcePreviewComponent,
} from './PostSourcePresentationView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Link: ({ children }: { children?: unknown }) => children,
  useRouter: () => ({ push: () => undefined }),
});
mockModule('react-native', {
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
});
mockModule('@/components/profile/ProfileNameBlock', {
  ProfileNameBlock: 'ProfileNameBlock',
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/lib/date', { formatTimelineTimestamp: () => '방금' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    borderDefault: '#ddd',
    foregroundSecondary: '#777',
    stateHover: '#eee',
  }),
});
mockModule('./PostContentRenderer', {
  PostContentRenderer: (props: Record<string, unknown>) =>
    createElement('PostContentRenderer', props),
});

let PostSourcePresentationView: typeof PostSourcePresentationViewComponent;
let PostSourcePreview: typeof PostSourcePreviewComponent;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostSourcePresentationView, PostSourcePreview } =
    await import('./PostSourcePresentationView'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

describe('PostSourcePresentationView mention relation wiring', () => {
  it('forwards mentionedProfiles from an ordinary post content relation', async () => {
    const mentionedProfiles = [mentionedProfile('profile-mentioned')];

    await render(
      createElement(PostSourcePresentationView, {
        post: postWithContent(mentionedProfiles) as never,
      }),
    );

    const contentRenderer = renderer?.root.findAll(
      (node) => (node.type as unknown) === 'PostContentRenderer',
    )[0];
    assert.equal(contentRenderer?.props.mentionedProfiles, mentionedProfiles);
  });

  it('forwards mentionedProfiles through the non-interactive source preview path', async () => {
    const mentionedProfiles = [mentionedProfile('profile-source-mentioned')];

    await render(
      createElement(PostSourcePreview, {
        interactive: false,
        source: postWithContent(mentionedProfiles) as never,
      }),
    );

    const contentRenderer = renderer?.root.findAll(
      (node) => (node.type as unknown) === 'PostContentRenderer',
    )[0];
    assert.equal(contentRenderer?.props.interactive, false);
    assert.equal(contentRenderer?.props.mentionedProfiles, mentionedProfiles);
  });
});

async function render(element: ReactElement) {
  await act(async () => {
    renderer = create(element);
  });
}

function mentionedProfile(id: string) {
  return {
    displayName: 'Mentioned Profile',
    id,
    relativeHandle: '@mentioned-profile',
  };
}

function postWithContent(mentionedProfiles: ReturnType<typeof mentionedProfile>[]) {
  return {
    content: {
      bodyText: '@mentioned-profile',
      contentWarning: null,
      document: null,
      media: [],
      mentionedProfiles,
    },
    createdAt: '2026-09-14T00:00:00.000Z',
    id: 'post-source-presentation',
    profile: {
      avatar: null,
      displayName: 'Author',
      handle: 'author',
      id: 'profile-author',
      relativeHandle: '@author',
    },
    repostSource: null,
  };
}
