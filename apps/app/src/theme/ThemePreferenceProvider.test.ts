import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ThemePreferenceProviderModule from './ThemePreferenceProvider';
import type * as ThemeModule from './ThemeProvider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let systemScheme: 'dark' | 'light' = 'light';
let updateSystemScheme: ((scheme: 'dark' | 'light') => void) | undefined;
let storedPreference: string | null = null;
let readError = false;
let writeError = false;
let deferRead = false;
let resolveRead: ((value: string | null) => void) | undefined;

const storage = {
  getItem: async () => {
    if (readError) {
      throw new Error('read failed');
    }
    if (deferRead) {
      return new Promise<string | null>((resolve) => {
        resolveRead = resolve;
      });
    }
    return storedPreference;
  },
  setItem: async (_key: string, value: string) => {
    if (writeError) {
      throw new Error('write failed');
    }
    storedPreference = value;
  },
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  AccessibilityInfo: {
    addEventListener: () => ({ remove: () => undefined }),
    isReduceMotionEnabled: async () => false,
  },
  useColorScheme: () => {
    const [scheme, setScheme] = useState(systemScheme);
    updateSystemScheme = setScheme;
    return scheme;
  },
});
mockModule('@react-native-async-storage/async-storage', { default: storage });

let providerModule: typeof ThemePreferenceProviderModule | undefined;
let themeModule: typeof ThemeModule | undefined;
let renderer: ReactTestRenderer | undefined;

before(async () => {
  providerModule = await import('./ThemePreferenceProvider');
  themeModule = await import('./ThemeProvider');
});

afterEach(async () => {
  systemScheme = 'light';
  updateSystemScheme = undefined;
  storedPreference = null;
  readError = false;
  writeError = false;
  deferRead = false;
  resolveRead = undefined;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  }
});

describe('ThemePreferenceProvider', () => {
  it('hydrates a normalized preference, follows the OS, and persists overrides', async () => {
    assert.ok(providerModule);
    storedPreference = 'dark';
    deferRead = true;
    let preference = '';
    let mode = '';
    let setPreference: ((next: 'dark' | 'light' | 'system') => void) | undefined;
    let hydrated = false;

    function Probe() {
      preference = providerModule!.useThemePreference();
      mode = themeModule!.useThemeMode();
      setPreference = providerModule!.useSetThemePreference();
      hydrated = true;
      return createElement('Probe', { mode, preference });
    }

    act(() => {
      renderer = create(
        createElement(providerModule!.ThemePreferenceProvider, null, createElement(Probe)),
      );
    });

    assert.ok(renderer);
    assert.equal(renderer.root.findAll((node) => String(node.type) === 'Probe').length, 0);
    await act(async () => resolveRead?.('dark'));
    deferRead = false;

    assert.equal(hydrated, true);
    assert.equal(preference, 'dark');
    assert.equal(mode, 'dark');

    await act(async () => updateSystemScheme?.('light'));
    assert.equal(mode, 'dark');

    await act(async () => setPreference?.('light'));
    assert.equal(preference, 'light');
    assert.equal(mode, 'light');
    assert.equal(storedPreference, 'light');

    await act(async () => updateSystemScheme?.('dark'));
    assert.equal(mode, 'light');

    await act(async () => renderer?.unmount());
    renderer = undefined;
    await act(async () => {
      renderer = create(
        createElement(providerModule!.ThemePreferenceProvider, null, createElement(Probe)),
      );
    });
    assert.equal(preference, 'light');
  });

  it('normalizes an invalid stored preference to system', async () => {
    assert.ok(providerModule);
    storedPreference = 'invalid';
    let preference = '';

    function Probe() {
      preference = providerModule!.useThemePreference();
      return null;
    }

    await act(async () => {
      renderer = create(
        createElement(providerModule!.ThemePreferenceProvider, null, createElement(Probe)),
      );
    });
    assert.equal(preference, 'system');
  });

  it('falls back to system on read failure without writing and keeps the session choice on write failure', async () => {
    assert.ok(providerModule);
    readError = true;
    let preference = '';
    let setPreference: ((next: 'dark' | 'light' | 'system') => void) | undefined;
    let storageError: 'read' | 'write' | null = null;

    function Probe() {
      preference = providerModule!.useThemePreference();
      setPreference = providerModule!.useSetThemePreference();
      storageError = providerModule!.useThemeStorageError();
      return null;
    }

    await act(async () => {
      renderer = create(
        createElement(providerModule!.ThemePreferenceProvider, null, createElement(Probe)),
      );
    });
    assert.equal(preference, 'system');
    assert.equal(storageError, 'read');
    assert.equal(storedPreference, null);

    readError = false;
    writeError = true;
    await act(async () => setPreference?.('dark'));
    assert.equal(preference, 'dark');
    assert.equal(storageError, 'write');
    assert.equal(storedPreference, null);
  });
});
