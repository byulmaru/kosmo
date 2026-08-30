import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ProfileTagChipModule from './ProfileTagChip';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HostProps = {
  children?: ReactNode;
};

const host = (name: string) => (props: HostProps) =>
  createElement(name as unknown as ElementType, props, props.children);

const IconButtonHost = host('IconButton');
const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

mockModule('react-native', {
  Pressable: host('Pressable'),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  View: ViewHost,
});
mockModule(require.resolve('lucide-react-native'), {
  XIcon: host('XIcon'),
});
mockModule('@/components/ui/IconButton', {
  ICON_BUTTON_TARGET_SIZE: 48,
  IconButton: IconButtonHost,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    border: 'border',
    surface: 'surface',
    text: 'text',
    textSecondary: 'secondary',
  }),
});
mockModule('@/theme/tokens', {
  iconSizes: { 20: 20 },
  radii: { full: 999 },
  spacing: { md: 12 },
  typography: { sm: {} },
});

let profileTagChipModule: typeof ProfileTagChipModule | undefined;

before(async () => {
  profileTagChipModule = await import('./ProfileTagChip');
});

function renderChip(props: Record<string, unknown>): ReactTestRenderer {
  assert.ok(profileTagChipModule);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(
        profileTagChipModule!.ProfileTagChip,
        props as unknown as ProfileTagChipModule.ProfileTagChipProps,
      ),
    );
  });
  assert.ok(renderer);
  return renderer;
}

test('display label overrides the hash presentation and remove label', () => {
  const renderer = renderChip({
    label: '개발자',
    name: 'dev',
    onRemove: () => undefined,
    removable: true,
  });
  const text = renderer.root
    .findAllByType(TextHost)
    .find((node) => node.props.children === '개발자');
  const removeButton = renderer.root.findByType(IconButtonHost);

  assert.ok(text);
  assert.equal(text.props.accessibilityLabel, '개발자');
  assert.equal(removeButton.props.accessibilityLabel, '개발자 제거');
});

test('without a display label ProfileTagChip keeps its hash presentation', () => {
  const renderer = renderChip({ name: 'dev', removable: false });
  const text = renderer.root.findByType(TextHost);

  assert.equal(text.props.children, '#dev');
  assert.equal(text.props.accessibilityLabel, '#dev');
});
