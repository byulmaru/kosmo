import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PublicContentInvitation as PublicContentInvitationExport } from './PublicContentInvitation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
let loginPressCount = 0;
let dismissed = false;
let measuredHeight = 0;
let viewport = { height: 844, width: 390 };
let renderer: ReactTestRenderer | undefined;
let PublicContentInvitation: typeof PublicContentInvitationExport;

mockModule('@/auth/webLogin', {
  startWebLoginFromPress: () => loginPressCount++,
});

mockModule('expo-router', {
  Link: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('Link', props, children as never),
});
mockModule('react-native', {
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
  useWindowDimensions: () => viewport,
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 0 }),
});
mockModule(require.resolve('lucide-react-native'), { X: 'X' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundCanvas: '#fff',
    borderSubtle: '#ddd',
    foregroundPrimary: '#111',
    textSecondary: '#555',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1 },
  breakpoints: { compact: 768, full: 1280 },
  fontWeights: { bold: '700' },
  radius: { 12: 12, full: 999 },
  space: { 8: 8, 12: 12, 16: 16, 48: 48 },
  spacing: { lg: 24, md: 16, sm: 8 },
  textStyles: { uiCopyL: {}, uiCopyM: {}, uiCopyS: {}, uiLabelL: {}, uiLabelM: {} },
});
mockModule('@/components/shell/NavigationLink', {
  NavigationLink: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('NavigationLink', props, children as never),
});
mockModule('@/components/ui/Button', {
  Button: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('Button', props, children as never),
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('IconButton', props, children as never),
});

before(async () => {
  ({ PublicContentInvitation } = await import('./PublicContentInvitation'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  loginPressCount = 0;
  dismissed = false;
  measuredHeight = 0;
  viewport = { height: 844, width: 390 };
  mock.restoreAll();
});

async function renderInvitation() {
  await act(async () => {
    renderer = create(
      createElement(PublicContentInvitation, {
        onDismiss: () => {
          dismissed = true;
        },
        onLayout: (height: number) => {
          measuredHeight = height;
        },
        visible: true,
      }),
    );
  });
  assert.ok(renderer);
  return renderer;
}

describe('PublicContentInvitation', () => {
  it('lets fixed left and right bounds determine the compact CTA width', async () => {
    viewport = { height: 900, width: 1024 };
    const view = await renderInvitation();
    const panel = view.root.findByProps({ testID: 'public-content-invitation' });
    const styleObjects = (panel.props.style as unknown[]).flat(Infinity) as Array<
      Record<string, unknown>
    >;
    const fixedStyle = styleObjects.find((style) => style.position === 'fixed');

    assert.deepEqual(
      { left: fixedStyle?.left, right: fixedStyle?.right, width: fixedStyle?.width },
      {
        left: 'calc((100vw - 680px) / 2 + 80px)',
        right: 'calc((100vw - 680px) / 2)',
        width: undefined,
      },
    );
    assert.ok(!styleObjects.some((style) => style.width === '100%'));
  });

  it('starts authentication without passing through the signup home', async () => {
    const view = await renderInvitation();
    const mainLink = view.root.findAllByType('Link' as never)[0];

    assert.equal(mainLink?.props.href, '/login');
    await act(async () => {
      view.root.findByType('Button' as never).props.onPress({ nativeEvent: { button: 0 } });
    });
    assert.equal(loginPressCount, 1);
  });

  it('opens the team and privacy destinations as independent links', async () => {
    const view = await renderInvitation();
    const externalLink = view.root.findAllByType('Link' as never)[1];
    const privacyLink = view.root.findByType('NavigationLink' as never);

    assert.equal(externalLink.props.href, 'https://byulmaru.co/about-us');
    assert.equal(privacyLink?.props.href, '/privacy');
  });

  it('reports measured height and dismisses with its accessible action', async () => {
    const view = await renderInvitation();
    const panel = view.root.findByProps({ testID: 'public-content-invitation' });

    await act(async () => {
      panel.props.onLayout({ nativeEvent: { layout: { height: 168 } } });
    });
    await act(async () => {
      view.root.findByProps({ accessibilityLabel: '가입 안내 닫기' }).props.onPress();
    });

    assert.equal(measuredHeight, 168);
    assert.equal(dismissed, true);
  });
});
