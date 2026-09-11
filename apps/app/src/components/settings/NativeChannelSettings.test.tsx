import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import { act, create as createTestRenderer } from 'react-test-renderer';
import type { ComponentType, ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

let activeChannel: 'dev' | 'prod' = 'prod';
let pendingSwitch: Promise<'failed' | 'reloading' | 'unchanged'> | undefined;
const switchCalls: Array<'dev' | 'prod'> = [];
const ButtonHost = 'Button' as unknown as ElementType;
const ModalSheetHost = 'ModalSheet' as unknown as ElementType;
const RadioGroupHost = 'RadioGroup' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;

mockModule('react-native', {
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: TextHost,
  View: 'View',
});
mockModule('@/config/nativeChannel', {
  getNativeDeploymentChannel: () => activeChannel,
  switchNativeChannel: async (channel: 'dev' | 'prod') => {
    switchCalls.push(channel);
    return pendingSwitch ?? 'reloading';
  },
});
mockModule('@/relay/RelayActorProvider', {
  useRelayActor: () => ({ clearNativeSession: async () => undefined }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ danger: 'danger', statePressed: 'pressed', textSecondary: 'secondary' }),
});
mockModule('@/theme/tokens', { space: { 8: 8 }, textStyles: { uiCopyS: { fontSize: 12 } } });
mockModule(new URL('../ui/Button.tsx', import.meta.url), { Button: ButtonHost });
mockModule(new URL('../ui/ModalSheet.tsx', import.meta.url), { ModalSheet: ModalSheetHost });
mockModule(new URL('../ui/RadioGroup.tsx', import.meta.url), {
  RadioGroup: RadioGroupHost,
  RadioOption: 'RadioOption',
});
mockModule(new URL('./SettingsItem.tsx', import.meta.url), { SettingsItem: 'SettingsItem' });

let NativeChannelSettings: ComponentType;

before(async () => {
  ({ NativeChannelSettings } = await import('./NativeChannelSettings'));
});

beforeEach(() => {
  activeChannel = 'prod';
  pendingSwitch = undefined;
  switchCalls.length = 0;
});

function render() {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = createTestRenderer(<NativeChannelSettings />);
  });
  assert.ok(renderer);
  return renderer;
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAllByType(ButtonHost).find((item) => item.props.children === label);
}

describe('NativeChannelSettings', () => {
  it('opens, cancels, and reports a failed pending switch', async () => {
    const renderer = render();
    const row = renderer.root.findByProps({ testID: 'native-channel-settings' });
    assert.equal(row.props.accessibilityLabel, '채널: prod');
    assert.deepEqual(row.props.accessibilityState, { expanded: false });

    act(() => row.props.onPress());
    const modal = renderer.root.findByType(ModalSheetHost);
    const selector = renderer.root.findByType(RadioGroupHost);
    assert.equal(modal.props.visible, true);
    assert.equal(selector.props.accessibilityLabel, '채널 선택');
    assert.equal(selector.props.value, 'prod');
    assert.equal(button(renderer, '저장')?.props.disabled, true);

    act(() => modal.props.onClose());
    assert.equal(modal.props.visible, false);
    assert.deepEqual(switchCalls, []);

    act(() => row.props.onPress());
    act(() => renderer.root.findByType(RadioGroupHost).props.onChange('dev'));
    let resolveSwitch!: (result: 'failed' | 'reloading' | 'unchanged') => void;
    pendingSwitch = new Promise((resolve) => {
      resolveSwitch = resolve;
    });

    act(() => {
      void button(renderer, '저장')?.props.onPress();
    });
    assert.equal(row.props.disabled, true);
    assert.equal(modal.props.dismissDisabled, true);
    assert.equal(button(renderer, '저장')?.props.loading, true);
    assert.equal(button(renderer, '취소')?.props.disabled, true);
    assert.equal(modal.props.visible, true);
    assert.deepEqual(switchCalls, ['dev']);

    const result = pendingSwitch;
    resolveSwitch('failed');
    await act(async () => {
      await result;
    });
    assert.equal(row.props.disabled, false);
    assert.equal(modal.props.dismissDisabled, false);
    assert.equal(renderer.root.findByType(RadioGroupHost).props.value, 'prod');
    assert.ok(
      renderer.root
        .findAllByType(TextHost)
        .some(
          (item) => item.props.children === '채널을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.',
        ),
    );
  });
});
