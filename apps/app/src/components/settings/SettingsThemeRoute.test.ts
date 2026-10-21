import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type SettingsThemeRouteExport from '@/app/(tabs)/(protected)/settings/theme';
import type { ThemePreference } from '@/theme/themePreference';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const analyticsCalls: Array<[string, Record<string, unknown>]> = [];
const setPreferenceCalls: ThemePreference[] = [];
let preference: ThemePreference = 'system';
let renderer: ReactTestRenderer | null = null;

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', { useRouter: () => ({}) });
const require = createRequire(import.meta.url);
const icons = { ArrowLeftIcon: 'ArrowLeftIcon' };
mockModule('lucide-react-native', icons);
mockModule(require.resolve('lucide-react-native'), icons);
mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/analytics/client', {
  trackAnalytics: (event: string, properties: Record<string, unknown>) => {
    analyticsCalls.push([event, properties]);
  },
});
mockModule('@/components/PageHeader', { PageHeader: 'PageHeader' });
mockModule('@/components/settings/settingsNavigation', {
  returnToSettingsParent: () => undefined,
});
mockModule('@/components/settings/SettingsRouteContext', {
  useSettingsDetailHeaderMode: () => 'hidden',
});
mockModule('@/components/ui/IconButton', { IconButton: 'IconButton' });
mockModule('@/components/ui/RadioGroup', {
  RadioGroup: ({ children, ...props }: { children?: unknown }) =>
    createElement('RadioGroup', props, children as never),
  RadioOption: (props: object) => createElement('RadioOption', props),
});
mockModule('@/components/ui/RouteScrollContainer', {
  RouteScrollContainer: ({ children }: { children?: unknown }) =>
    createElement('RouteScrollContainer', null, children as never),
});
mockModule('@/theme/ThemePreferenceProvider', {
  useSetThemePreference: () => (nextPreference: ThemePreference) => {
    preference = nextPreference;
    setPreferenceCalls.push(nextPreference);
  },
  useThemePreference: () => preference,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundPrimary: '#111', foregroundSecondary: '#666' }),
});
mockModule('@/theme/tokens', {
  layoutRecipes: { formStack: {} },
  space: { 16: 16 },
  textStyles: { uiCopyM: {}, uiLabelL: {} },
});

let SettingsThemeRoute: typeof SettingsThemeRouteExport;

before(async () => {
  ({ default: SettingsThemeRoute } = await import('@/app/(tabs)/(protected)/settings/theme'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  analyticsCalls.length = 0;
  setPreferenceCalls.length = 0;
  preference = 'system';
});

describe('SettingsThemeRoute analytics', () => {
  it('변경한 테마만 추적하고 같은 현재 값과 초기 렌더는 추적하지 않는다', async () => {
    await act(async () => {
      renderer = create(createElement(SettingsThemeRoute));
    });
    assert.deepEqual(analyticsCalls, []);

    const initialGroup = renderer!.root.find((node) => (node.type as unknown) === 'RadioGroup');
    await act(async () => initialGroup.props.onChange('dark'));
    assert.deepEqual(setPreferenceCalls, ['dark']);
    assert.deepEqual(analyticsCalls, [['theme_changed', { preference: 'dark' }]]);

    await act(async () => {
      renderer?.update(createElement(SettingsThemeRoute));
    });
    const currentGroup = renderer!.root.find((node) => (node.type as unknown) === 'RadioGroup');
    await act(async () => currentGroup.props.onChange('dark'));
    assert.deepEqual(setPreferenceCalls, ['dark', 'dark']);
    assert.deepEqual(analyticsCalls, [['theme_changed', { preference: 'dark' }]]);

    await act(async () => currentGroup.props.onChange('light'));
    assert.deepEqual(analyticsCalls, [
      ['theme_changed', { preference: 'dark' }],
      ['theme_changed', { preference: 'light' }],
    ]);
  });
});
