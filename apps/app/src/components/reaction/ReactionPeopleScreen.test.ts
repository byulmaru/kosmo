import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const require = createRequire(import.meta.url);

const platform: { OS: 'ios' | 'web' } = { OS: 'ios' };
const ViewHost = 'View' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
const accessibilityEvents: Array<{ target: object; event: string }> = [];
let webFocusCount = 0;
const webHeading = { focus: () => (webFocusCount += 1), tabIndex: 0 };
const nativeTitle = {};
const nativeHeader = {
  querySelector: () => webHeading,
};

mockModule('react-native', {
  AccessibilityInfo: {
    sendAccessibilityEvent: (target: object, event: string) => {
      accessibilityEvents.push({ target, event });
    },
  },
  Platform: platform,
  StyleSheet: { create: <T>(styles: T) => styles },
  View: ViewHost,
});
mockModule('@/components/PageHeader', {
  PageHeader: (props: { title: string; leading?: ReactNode; titleRef?: unknown }) =>
    createElement(
      'PageHeader',
      props,
      createElement(TextHost, { ref: props.titleRef }, props.title),
    ),
});
mockModule('@/components/ui/IconButton', {
  IconButton: (props: { children?: ReactNode }) => createElement('IconButton', props),
});
mockModule('@/components/pagination/PaginationScrollView', {
  PaginationScrollView: 'PaginationScrollView',
});
mockModule('@/components/RouteBoundary', {
  RouteBoundary: 'RouteBoundary',
  useRouteBoundary: () => ({ fetchKey: 0 }),
});
mockModule('@/components/ui/StateView', { StateView: 'StateView' });
mockModule('./ReactionPeopleFilter', { ReactionPeopleFilter: 'ReactionPeopleFilter' });
mockModule('./ReactionProfileConnection', {
  ReactionProfileConnection: 'ReactionProfileConnection',
});
mockModule('./ReactionProfileList', { ReactionProfileList: 'ReactionProfileList' });
mockModule('react-relay', {
  graphql: () => 'ReactionPeopleScreenQuery',
  useLazyLoadQuery: () => ({ node: null }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundPrimary: 'foreground' }),
});
mockModule('lucide-react-native', { ChevronLeftIcon: 'ChevronLeftIcon' });
mockModule(require.resolve('lucide-react-native'), { ChevronLeftIcon: 'ChevronLeftIcon' });

let ReactionPeopleHeader: ComponentType<{ onBack: () => void }>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ ReactionPeopleHeader } = await import('./ReactionPeopleScreen'));
});

beforeEach(() => {
  platform.OS = 'ios';
  accessibilityEvents.length = 0;
  webFocusCount = 0;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

test('Native mount exposes the header semantics and moves accessibility focus to it', async () => {
  await act(async () => {
    renderer = create(createElement(ReactionPeopleHeader, { onBack: () => undefined }), {
      createNodeMock: (element) => {
        if (element.type === ViewHost) {
          return nativeHeader;
        }
        if (element.type === TextHost) {
          return nativeTitle;
        }
        return null;
      },
    });
  });

  const header = renderer?.root.findByType(ViewHost);
  assert.equal(header?.props.accessible, undefined);
  assert.equal(header?.props.accessibilityRole, undefined);
  assert.deepEqual(accessibilityEvents, [{ target: nativeTitle, event: 'focus' }]);
});

test('Web mount keeps DOM heading focus behavior', async () => {
  platform.OS = 'web';

  await act(async () => {
    renderer = create(createElement(ReactionPeopleHeader, { onBack: () => undefined }), {
      createNodeMock: (element) => (element.type === ViewHost ? nativeHeader : null),
    });
  });

  const header = renderer?.root.findByType(ViewHost);
  assert.equal(header?.props.accessible, undefined);
  assert.equal(header?.props.accessibilityRole, undefined);
  assert.equal(webHeading.tabIndex, -1);
  assert.equal(webFocusCount, 1);
  assert.deepEqual(accessibilityEvents, []);
});
