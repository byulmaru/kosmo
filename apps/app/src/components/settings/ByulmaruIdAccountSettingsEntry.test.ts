import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let canOpenResult = true;
let canOpenError: Error | null = null;
let openFailureCount = 0;
let openImplementation: (() => Promise<void>) | null = null;
let openAttempts = 0;

const canOpenURL = mock.fn(async () => {
  if (canOpenError) {
    throw canOpenError;
  }
  return canOpenResult;
});
const openURL = mock.fn(async (url: string) => {
  void url;
  openAttempts += 1;
  if (openImplementation) {
    return await openImplementation();
  }
  if (openAttempts <= openFailureCount) {
    throw new Error('external navigation failed');
  }
});

const require = createRequire(import.meta.url);

mock.module('react-native', {
  exports: {
    Linking: { canOpenURL, openURL },
    Platform: { OS: 'web' },
    Pressable: 'Pressable',
    StyleSheet: { create: <T>(styles: T) => styles },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: { ChevronRightIcon: 'ChevronRightIcon' },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useTheme: () => ({
      border: '#dddddd',
      danger: '#aa1010',
      divider: '#eeeeee',
      text: '#111111',
      textSecondary: '#666666',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let Entry: ComponentType;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ ByulmaruIdAccountSettingsEntry: Entry } = await import('./ByulmaruIdAccountSettingsEntry'));
});

afterEach(async () => {
  canOpenResult = true;
  canOpenError = null;
  openFailureCount = 0;
  openImplementation = null;
  openAttempts = 0;
  canOpenURL.mock.resetCalls();
  openURL.mock.resetCalls();
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('ByulmaruIdAccountSettingsEntry', () => {
  it('label·link semantics·chevron과 canonical URL 이동을 제공한다', async () => {
    await render();

    const entry = byTestId('byulmaru-id-account-settings-entry');
    assert.equal(entry.props.accessibilityLabel, 'Byulmaru ID 계정 설정, 외부 서비스로 이동');
    assert.equal(entry.props.accessibilityRole, 'link');
    assert.equal(rendered('ChevronRightIcon').length, 1);

    await act(async () => entry.props.onFocus());
    assert.equal(
      byTestId('byulmaru-id-account-settings-entry').props.style({ pressed: false })[1]
        .outlineWidth,
      2,
    );
    await act(async () => entry.props.onBlur());

    await act(async () => entry.props.onPress());

    assert.equal(canOpenURL.mock.callCount(), 1);
    assert.equal(openURL.mock.callCount(), 1);
    assert.equal(openURL.mock.calls[0].arguments[0], 'https://id.byulmaru.co');
    assert.equal(rendered('byulmaru-id-account-settings-navigation-error').length, 0);
  });

  it('지원하지 않는 환경에서는 외부 이동을 실행하지 않고 재시도를 표시한다', async () => {
    canOpenResult = false;
    await render();

    await act(async () => byTestId('byulmaru-id-account-settings-entry').props.onPress());

    assert.equal(openURL.mock.callCount(), 0);
    assert.equal(
      byTestId('byulmaru-id-account-settings-navigation-error').props.accessibilityRole,
      'alert',
    );
    assert.equal(byTestId('byulmaru-id-account-settings-retry').props.accessibilityRole, 'button');
  });

  it('지원 확인과 외부 이동 rejection을 안전한 오류로 처리한다', async () => {
    canOpenError = new Error('cannot inspect URL');
    await render();

    await act(async () => byTestId('byulmaru-id-account-settings-entry').props.onPress());
    assert.equal(openURL.mock.callCount(), 0);
    assert.ok(texts().includes('Byulmaru ID 계정 설정을 열지 못했어요.'));

    canOpenError = null;
    openFailureCount = 1;
    await act(async () => byTestId('byulmaru-id-account-settings-retry').props.onPress());
    assert.equal(openURL.mock.callCount(), 1);
    assert.ok(byTestId('byulmaru-id-account-settings-navigation-error'));
  });

  it('실패한 외부 이동을 같은 canonical URL로 재시도해 성공하면 오류를 제거한다', async () => {
    openFailureCount = 1;
    await render();

    await act(async () => byTestId('byulmaru-id-account-settings-entry').props.onPress());
    assert.ok(byTestId('byulmaru-id-account-settings-navigation-error'));

    await act(async () => byTestId('byulmaru-id-account-settings-retry').props.onPress());

    assert.equal(openURL.mock.callCount(), 2);
    assert.equal(queryByTestId('byulmaru-id-account-settings-navigation-error'), undefined);
    assert.equal(openURL.mock.calls[1].arguments[0], 'https://id.byulmaru.co');
  });

  it('외부 이동 중 중복 실행을 막고 busy 상태를 노출한다', async () => {
    let resolveOpen: (() => void) | undefined;
    openImplementation = () =>
      new Promise<void>((resolve) => {
        resolveOpen = resolve;
      });
    await render();

    const entry = byTestId('byulmaru-id-account-settings-entry');
    await act(async () => {
      void entry.props.onPress();
      await Promise.resolve();
    });
    assert.equal(entry.props.disabled, true);
    assert.equal(byTestId('byulmaru-id-account-settings-entry').props.disabled, true);
    assert.equal(
      byTestId('byulmaru-id-account-settings-entry').props.accessibilityState.busy,
      true,
    );

    await act(async () => {
      void byTestId('byulmaru-id-account-settings-entry').props.onPress();
      await Promise.resolve();
    });
    assert.equal(openURL.mock.callCount(), 1);

    await act(async () => {
      resolveOpen?.();
      await Promise.resolve();
    });
    assert.equal(byTestId('byulmaru-id-account-settings-entry').props.disabled, false);
  });
});

async function render() {
  await act(async () => {
    renderer = create(createElement(Entry));
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

function queryByTestId(testID: string): ReactTestInstance | undefined {
  assert.ok(renderer);
  return renderer.root.findAllByProps({ testID })[0];
}

function texts(): string[] {
  return rendered('Text').flatMap((node) =>
    typeof node.props.children === 'string' ? [node.props.children] : [],
  );
}
