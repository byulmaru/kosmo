import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostMediaItem } from './PostMediaGallery';
import type { PostMediaOpenHandler } from './PostMediaImage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Linking: { openURL: async () => undefined },
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, key: unknown) => key,
});
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children, href }: { children: ReactNode; href: unknown }) =>
    createElement('NavigationLink', { href }, children),
});
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ selectedProfileId: null, sessionId: null }),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({
    actionLinkBase: '#00f',
    border: '#ddd',
    primary: '#ff0',
    primaryHover: '#ee0',
    surface: '#fafafa',
    text: '#111',
    textSecondary: '#777',
  }),
  useReducedMotion: () => true,
});
mockModule(new URL('./PostMediaGallery.tsx', import.meta.url), {
  PostMediaGallery: (props: Record<string, unknown>) => createElement('PostMediaGallery', props),
});

type RendererProps = {
  bodyText: string;
  contentWarningPresentation?: 'default' | 'revealed';
  contentWarning: string | null | undefined;
  document: unknown;
  interactive?: boolean;
  media: ReadonlyArray<PostMediaItem> | null;
  mediaPresentation?: 'default' | 'hidden';
  mentionedProfiles: ReadonlyArray<{
    readonly displayName: string;
    readonly id: string;
    readonly relativeHandle: string;
  }>;
  numberOfLines?: number;
  onBodyPress?: () => void;
  onMediaOpen?: PostMediaOpenHandler;
  postId: string;
};

let PostContentRenderer: ComponentType<RendererProps>;
let PostContentWarningRevealProvider: ComponentType<{ children?: ReactNode }>;
let Button: ComponentType<Record<string, unknown>>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  const imported = await import('./PostContentRenderer');
  PostContentRenderer = imported.PostContentRenderer as unknown as ComponentType<RendererProps>;
  ({ PostContentWarningRevealProvider } = await import('./PostContentWarningRevealContext'));
  ({ Button } = await import('@/components/ui/Button'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

describe('PostContentRenderer', () => {
  it('content warning reveal uses Button and forwards expanded state', async () => {
    await render({
      bodyText: '원문 본문',
      contentWarning: '민감한 내용',
      document: null,
      media: [],
      mentionedProfiles: [],
      postId: 'post-warning-button',
    });

    assert.deepEqual(
      renderer?.root.findAllByType(Button).map(({ props }) => ({
        accessibilityLabel: props.accessibilityLabel,
        accessibilityState: props.accessibilityState,
        ariaExpanded: props['aria-expanded'],
      })),
      [
        {
          accessibilityLabel: '내용 보기',
          accessibilityState: { expanded: false },
          ariaExpanded: false,
        },
      ],
    );
  });

  it('Gallery에는 viewer open callback만 전달한다', async () => {
    const onMediaOpen = () => undefined;
    await render({
      bodyText: '',
      contentWarning: null,
      document: null,
      media: [{ altText: null, id: 'media-1', url: 'https://media.example/1.webp' }],
      mentionedProfiles: [],
      onMediaOpen,
      postId: 'post-viewer-callbacks',
    });

    const gallery = rendered('PostMediaGallery')[0];
    assert.ok(gallery);
    assert.equal(gallery.props.onMediaOpen, onMediaOpen);
    assert.equal('onMediaUnavailable' in gallery.props, false);
  });

  it('Media를 숨기는 상세 표현에서는 unavailable Gallery도 렌더하지 않는다', async () => {
    await render({
      bodyText: '',
      contentWarning: null,
      document: null,
      media: null,
      mediaPresentation: 'hidden',
      mentionedProfiles: [],
      postId: 'post-viewer-hidden',
    });

    assert.equal(rendered('PostMediaGallery').length, 0);
  });

  it('does not mount media while a Content Warning is hidden, then passes media after reveal', async () => {
    const media: PostMediaItem[] = [
      { altText: '설명', id: 'media-1', url: 'https://media.example/1.webp' },
    ];
    await render({
      bodyText: '원문 본문',
      contentWarning: '민감한 내용',
      document: null,
      media,
      mentionedProfiles: [],
      postId: 'post-1',
    });

    const contentRoot = byTestId('post-content-renderer');
    assert.equal(rendered('PostMediaGallery').length, 0);
    const toggle = rendered('Pressable').find(
      (node) => node.props.testID === 'post-content-warning-toggle',
    );
    assert.ok(toggle);
    assert.equal(
      rendered('Text').some((node) => node.props.children === '원문 본문'),
      false,
    );

    await act(async () =>
      toggle.props.onPress({
        stopPropagation: () => undefined,
      }),
    );

    const galleries = rendered('PostMediaGallery');
    assert.equal(galleries.length, 1);
    assert.deepEqual(galleries[0].props.media, media);
    assert.equal(
      contentRoot.findAll((node) => (node.type as unknown) === 'PostMediaGallery').length,
      1,
    );
    assert.equal(
      rendered('Text').some((node) => node.props.children === '원문 본문'),
      true,
    );
  });

  it('Viewer 공개 표현은 warning control 없이 원문을 표시하고 Media는 숨긴다', async () => {
    await render({
      bodyText: '원문 본문',
      contentWarning: '민감한 내용',
      contentWarningPresentation: 'revealed',
      document: null,
      media: [],
      mediaPresentation: 'hidden',
      mentionedProfiles: [],
      postId: 'post-viewer-warning',
    });

    assert.equal(
      rendered('Pressable').some((node) => node.props.testID === 'post-content-warning-toggle'),
      false,
    );
    assert.equal(
      rendered('Text').some((node) => node.props.children === '원문 본문'),
      true,
    );
    assert.equal(rendered('PostMediaGallery').length, 0);
  });

  it('요청한 원문 줄 수를 plain text와 document root에 적용한다', async () => {
    await render({
      bodyText: '세 줄까지만 표시할 원문',
      contentWarning: null,
      document: null,
      media: [],
      numberOfLines: 3,
      mentionedProfiles: [],
      postId: 'post-line-limit',
    });

    assert.equal(
      rendered('Text').find((node) => node.props.children === '세 줄까지만 표시할 원문')?.props
        .numberOfLines,
      3,
    );

    await render({
      bodyText: '문서 원문',
      contentWarning: null,
      document: {
        body: {
          attrs: { sensitiveMedia: false },
          content: [{ content: [{ text: '문서 원문', type: 'text' }], type: 'paragraph' }],
          type: 'doc',
        },
        version: 1,
      },
      media: [],
      numberOfLines: 3,
      mentionedProfiles: [],
      postId: 'post-document-line-limit',
    });

    assert.equal(
      rendered('Text').find((node) => node.props.numberOfLines === 3)?.props.numberOfLines,
      3,
    );
  });

  it('keeps the canonical content root around warning and revealed body content', async () => {
    await render({
      bodyText: '원문 본문',
      contentWarning: '민감한 내용',
      document: null,
      media: [],
      mentionedProfiles: [],
      postId: 'post-2',
    });

    const contentRoot = byTestId('post-content-renderer');
    assert.equal(
      contentRoot.findAll((node) => node.props.testID === 'post-content-warning').length,
      1,
    );

    const toggle = rendered('Pressable').find(
      (node) => node.props.testID === 'post-content-warning-toggle',
    );
    assert.ok(toggle);
    await act(async () =>
      toggle.props.onPress({
        stopPropagation: () => undefined,
      }),
    );

    const body = rendered('Text').find((node) => node.props.children === '원문 본문');
    assert.ok(body);
    const galleries = rendered('PostMediaGallery');
    assert.equal(galleries.length, 1);
    assert.equal(
      contentRoot.findAll((node) => (node.type as unknown) === 'PostMediaGallery').length,
      1,
    );
  });

  it('matches Mention nodes by projected Profile ID and renders the Profile relative handle', async () => {
    const firstProfileId = 'UHJvZmlsZS0x';
    const secondProfileId = 'UHJvZmlsZS0y';
    const onBodyPress = () => undefined;
    await render({
      bodyText: '@first-profile @second-profile @알 수 없는 사용자',
      contentWarning: null,
      document: {
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'mention', attrs: { profileId: firstProfileId } },
                { type: 'text', text: ' ' },
                { type: 'mention', attrs: { profileId: secondProfileId } },
                { type: 'text', text: ' ' },
                { type: 'mention', attrs: { profileId: 'UHJvZmlsZS1taXNzaW5n' } },
              ],
            },
          ],
        },
      },
      media: [],
      mentionedProfiles: [
        {
          displayName: 'Second Profile',
          id: secondProfileId,
          relativeHandle: '@second-profile',
        },
        {
          displayName: 'First Profile',
          id: firstProfileId,
          relativeHandle: '@first-profile',
        },
      ],
      onBodyPress,
      postId: 'post-mention-id-match',
    });

    assert.deepEqual(
      rendered('NavigationLink').map(({ props }) => props.href),
      ['/@first-profile', '/@second-profile'],
    );
    assert.equal(
      rendered('Text').filter((node) => renderedText(node) === '@first-profile').length,
      1,
    );
    assert.equal(
      rendered('Text').filter((node) => renderedText(node) === '@second-profile').length,
      1,
    );
    assert.equal(
      rendered('Text').filter((node) => renderedText(node) === '@알 수 없는 사용자').length,
      1,
    );
    assert.equal(
      rendered('Text').some((node) => renderedText(node) === '@missing'),
      false,
    );
  });

  it('keeps repeated Mention occurrences in document order while matching by Profile ID', async () => {
    const firstProfileId = 'profile-first';
    const secondProfileId = 'profile-second';
    await render({
      bodyText: '@first-profile / @first-profile / @second-profile',
      contentWarning: null,
      document: {
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'mention', attrs: { profileId: firstProfileId } },
                { type: 'text', text: ' / ' },
                { type: 'mention', attrs: { profileId: firstProfileId } },
                { type: 'text', text: ' / ' },
                { type: 'mention', attrs: { profileId: secondProfileId } },
              ],
            },
          ],
        },
      },
      media: [],
      mentionedProfiles: [
        {
          displayName: 'Second Profile',
          id: secondProfileId,
          relativeHandle: '@second-profile',
        },
        {
          displayName: 'First Profile',
          id: firstProfileId,
          relativeHandle: '@first-profile',
        },
      ],
      postId: 'post-mention-repeated-order',
    });

    assert.deepEqual(
      rendered('NavigationLink').map(({ props }) => props.href),
      ['/@first-profile', '/@first-profile', '/@second-profile'],
    );
  });

  it('keeps a matched Mention inline while the post body remains the parent target', async () => {
    await render({
      bodyText: '본문 @profile',
      contentWarning: null,
      document: {
        version: 1,
        summary: null,
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: '본문 ' },
                { type: 'mention', attrs: { profileId: 'profile-inline' } },
              ],
            },
          ],
        },
      },
      media: [],
      mentionedProfiles: [
        {
          displayName: 'Inline Profile',
          id: 'profile-inline',
          relativeHandle: '@profile',
        },
      ],
      onBodyPress: () => undefined,
      postId: 'post-mention-inline',
    });

    assert.deepEqual(
      rendered('Pressable').map(({ props }) => props.testID),
      ['post-list-row-body'],
    );
    assert.deepEqual(
      rendered('NavigationLink').map(({ props }) => props.href),
      ['/@profile'],
    );
    assert.equal(rendered('Text').filter((node) => renderedText(node) === '@profile').length, 1);
  });
});

async function render(props: RendererProps) {
  await act(async () => {
    if (renderer) {
      renderer.update(
        createElement(
          PostContentWarningRevealProvider,
          null,
          createElement(PostContentRenderer, props),
        ),
      );
    } else {
      renderer = create(
        createElement(
          PostContentWarningRevealProvider,
          null,
          createElement(PostContentRenderer, props),
        ),
      );
    }
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}

function renderedText(instance: ReactTestInstance): string {
  return instance.children
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      return renderedText(child as ReactTestInstance);
    })
    .join('');
}
