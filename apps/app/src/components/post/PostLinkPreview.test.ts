import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { PostLinkPreviewData } from './PostLinkPreview';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);
const openedURLs: string[] = [];

mockModule('react-native', {
  Image: 'Image',
  Linking: {
    openURL: async (url: string) => {
      openedURLs.push(url);
    },
  },
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: object) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundElevated: '#fff',
    backgroundSurface: '#fafafb',
    borderDefault: '#dfdfe5',
    foregroundPrimary: '#1a1a1a',
    foregroundSecondary: '#64646f',
  }),
});
mockModule('react-relay', {
  graphql: () => ({}),
  useLazyLoadQuery: () => {
    throw new Error('The card presentation test must not run its Relay query.');
  },
});

let PostLinkPreviewCard: ComponentType<{
  interactive?: boolean;
  preview: PostLinkPreviewData;
}>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ PostLinkPreviewCard } = await import('./PostLinkPreview'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
  openedURLs.length = 0;
});

describe('PostLinkPreviewCard', () => {
  it('opens the original URL and stops the parent post press', async () => {
    const url = 'https://example.com/articles/first-link';
    await render({
      preview: {
        description: null,
        imageUrl: null,
        title: '원문 페이지 제목',
        url,
      },
    });

    const card = rendered('Pressable')[0];
    assert.ok(card);
    assert.equal(card.props.accessibilityRole, 'link');
    assert.equal(card.props.accessibilityLabel, '원문 페이지 제목, example.com');
    assert.equal(rendered('Image').length, 0);
    assert.deepEqual(
      rendered('Text').map((node) => node.props.children),
      ['example.com', '원문 페이지 제목'],
    );

    let prevented = false;
    let stopped = false;
    await act(async () =>
      card.props.onPress({
        preventDefault: () => {
          prevented = true;
        },
        stopPropagation: () => {
          stopped = true;
        },
      }),
    );
    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.deepEqual(openedURLs, [url]);
  });

  it('shows an image and long text without making a noninteractive preview a link', async () => {
    const preview: PostLinkPreviewData = {
      description: '긴 설명 '.repeat(30),
      imageUrl: 'https://cdn.example.com/preview.webp',
      title: '긴 제목 '.repeat(30),
      url: 'https://example.com/a/long/path',
    };
    await render({ interactive: false, preview });

    assert.equal(rendered('Pressable').length, 0);
    assert.equal(rendered('Image').length, 1);
    assert.deepEqual(rendered('Image')[0]?.props.source, { uri: preview.imageUrl });
    const [hostname, title, description] = rendered('Text');
    assert.equal(hostname?.props.numberOfLines, 1);
    assert.equal(title?.props.numberOfLines, 2);
    assert.equal(description?.props.numberOfLines, 2);
  });
});

async function render(props: { interactive?: boolean; preview: PostLinkPreviewData }) {
  await act(async () => {
    renderer = create(createElement(PostLinkPreviewCard, props));
  });
}

function rendered(type: string): ReactTestInstance[] {
  return renderer?.root.findAll((node) => node.type === type) ?? [];
}
