import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SettingsMuteAndBlockNavigation as SettingsMuteAndBlockNavigationExport } from './SettingsMuteAndBlockNavigation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

mock.module('react-native', {
  exports: {
    StyleSheet: { create: <T>(styles: T) => styles },
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('@/theme/tokens', {
  exports: { layoutRecipes: { listStack: {} } },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsLinkRow.tsx', import.meta.url), {
  exports: {
    SettingsLinkRow: (props: Record<string, unknown>) => createElement('SettingsLinkRow', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsMuteAndBlockNavigation: typeof SettingsMuteAndBlockNavigationExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsMuteAndBlockNavigation } = await import('./SettingsMuteAndBlockNavigation'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
});

describe('SettingsMuteAndBlockNavigation', () => {
  it('provides separate links and marks the selected natural language mute destination', async () => {
    await act(async () => {
      renderer = create(
        createElement(SettingsMuteAndBlockNavigation, { selected: 'natural-language-mute' }),
      );
    });

    assert.ok(renderer);
    const destinations = renderer.root.findAll((node) => String(node.type) === 'SettingsLinkRow');
    assert.deepEqual(
      destinations.map(({ props }) => [props.href, props.selected]),
      [
        ['/settings/muted-profiles', false],
        ['/settings/blocked-profiles', false],
        ['/settings/natural-language-mute', true],
      ],
    );
  });
});
