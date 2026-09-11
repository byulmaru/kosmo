import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create as createTestRenderer } from 'react-test-renderer';
import type { ComponentType, ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

let platformOS: 'ios' | 'web' = 'ios';
let activeChannel: 'dev' | 'prod' = 'prod';
let switchResult: 'failed' | 'reloading' | 'unchanged' = 'reloading';
let pendingSwitch: Promise<'failed' | 'reloading' | 'unchanged'> | undefined;
const switchCalls: Array<'dev' | 'prod'> = [];
let receivedClearSession: (() => Promise<void>) | undefined;
const clearSession = async () => undefined;
const ButtonHost = 'Button' as unknown as ElementType;
const ModalSheetHost = 'ModalSheet' as unknown as ElementType;
const RadioGroupHost = 'RadioGroup' as unknown as ElementType;
const SettingsItemHost = 'SettingsItem' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
const PressableElementHost = 'Pressable' as unknown as ElementType;
const PressableHost = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
  createElement(PressableElementHost, props, children);

mockModule('react-native', {
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: TextHost,
  View: 'View',
});
mockModule('@/config/nativeChannel', {
  getNativeDeploymentChannel: () => activeChannel,
  switchNativeChannel: async (
    channel: 'dev' | 'prod',
    clearSessionCallback: () => Promise<void>,
  ) => {
    switchCalls.push(channel);
    receivedClearSession = clearSessionCallback;
    return pendingSwitch ? pendingSwitch : switchResult;
  },
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    danger: 'danger',
    statePressed: 'pressed',
    textSecondary: 'secondary',
  }),
});
mockModule('@/theme/tokens', {
  space: { 8: 8 },
  textStyles: { uiCopyS: { fontSize: 12 } },
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
    createElement(ButtonHost, props, children),
});
mockModule(new URL('../ui/ModalSheet.tsx', import.meta.url), {
  ModalSheet: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
    createElement(ModalSheetHost, props, children),
});
mockModule(new URL('../ui/RadioGroup.tsx', import.meta.url), {
  RadioGroup: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
    createElement(RadioGroupHost, props, children),
  RadioOption: (props: Record<string, unknown>) => createElement('RadioOption', props),
});
mockModule(new URL('./SettingsItem.tsx', import.meta.url), {
  SettingsItem: (props: Record<string, unknown>) => createElement(SettingsItemHost, props),
});

let NativeChannelSettings: ComponentType<{ clearSession: () => Promise<void> }>;

before(async () => {
  ({ NativeChannelSettings } = await import('./NativeChannelSettings'));
});

beforeEach(() => {
  platformOS = 'ios';
  activeChannel = 'prod';
  switchResult = 'reloading';
  pendingSwitch = undefined;
  switchCalls.length = 0;
  receivedClearSession = undefined;
});

function render() {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = createTestRenderer(<NativeChannelSettings clearSession={clearSession} />);
  });
  assert.ok(renderer);
  return renderer;
}

describe('NativeChannelSettings', () => {
  it('opens the native channel row and saves a changed channel', async () => {
    const renderer = render();
    const row = renderer.root.findByProps({ testID: 'native-channel-settings' });
    assert.equal(row.props.accessibilityLabel, '채널: prod');

    act(() => row.props.onPress());
    const selector = renderer.root.findByType(RadioGroupHost);
    assert.equal(selector.props.accessibilityLabel, '채널 선택');
    assert.equal(selector.props.value, 'prod');

    act(() => selector.props.onChange('dev'));
    const save = renderer.root
      .findAllByType(ButtonHost)
      .find((button) => button.props.children === '저장');
    assert.ok(save);

    await act(async () => save.props.onPress());
    assert.deepEqual(switchCalls, ['dev']);
    assert.equal(receivedClearSession, clearSession);
    assert.equal(renderer.root.findByType(ModalSheetHost).props.visible, false);
  });

  it('keeps the original selection and reports a failed switch', async () => {
    switchResult = 'failed';
    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'native-channel-settings' }).props.onPress());
    const selector = renderer.root.findByType(RadioGroupHost);
    act(() => selector.props.onChange('dev'));

    const save = renderer.root
      .findAllByType(ButtonHost)
      .find((button) => button.props.children === '저장');
    assert.ok(save);
    await act(async () => save.props.onPress());

    assert.equal(renderer.root.findByType(RadioGroupHost).props.value, 'prod');
    const error = renderer.root
      .findAllByType(TextHost)
      .find(
        (text) => text.props.children === '채널을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    assert.ok(error);
  });

  it('keeps the picker pending while a switch is unresolved', async () => {
    let resolveSwitch!: (result: 'failed' | 'reloading' | 'unchanged') => void;
    pendingSwitch = new Promise((resolve) => {
      resolveSwitch = resolve;
    });

    const renderer = render();
    act(() => renderer.root.findByProps({ testID: 'native-channel-settings' }).props.onPress());
    const selector = renderer.root.findByType(RadioGroupHost);
    act(() => selector.props.onChange('dev'));

    const findButton = (label: string) =>
      renderer.root.findAllByType(ButtonHost).find((button) => button.props.children === label);
    const save = findButton('저장');
    const cancel = findButton('취소');
    assert.ok(save);
    assert.ok(cancel);

    act(() => save.props.onPress());
    assert.deepEqual(switchCalls, ['dev']);
    assert.equal(renderer.root.findByType(ModalSheetHost).props.dismissDisabled, true);
    assert.equal(findButton('취소')?.props.disabled, true);
    assert.equal(findButton('저장')?.props.loading, true);

    act(() => findButton('저장')?.props.onPress());
    act(() => renderer.root.findByType(ModalSheetHost).props.onClose());
    assert.deepEqual(switchCalls, ['dev']);
    assert.equal(renderer.root.findByType(ModalSheetHost).props.visible, true);

    const switchResultPromise = pendingSwitch;
    resolveSwitch('reloading');
    await act(async () => {
      await switchResultPromise;
    });
    assert.equal(renderer.root.findByType(ModalSheetHost).props.visible, false);
  });

  it('closes the picker without changing the channel when cancelled', () => {
    const renderer = render();
    const row = renderer.root.findByProps({ testID: 'native-channel-settings' });
    act(() => row.props.onPress());
    const modal = renderer.root.findByType(ModalSheetHost);
    assert.equal(modal.props.visible, true);

    act(() => modal.props.onClose());
    assert.equal(renderer.root.findByType(ModalSheetHost).props.visible, false);
    assert.deepEqual(switchCalls, []);
  });

  it('does not expose the channel control on Web', () => {
    platformOS = 'web';
    const renderer = render();
    assert.equal(renderer.toJSON(), null);
  });
});
