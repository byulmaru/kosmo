import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode, Ref } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as RadioGroupModule from './RadioGroup';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PressableProps = {
  accessibilityLabel?: string;
  children?: ReactNode;
  style?: unknown;
};

const focusedLabels: string[] = [];
const PressableHost = forwardRef<{ focus: () => void }, PressableProps>(function PressableMock(
  props,
  ref: Ref<{ focus: () => void }>,
) {
  useImperativeHandle(
    ref,
    () => ({
      focus: () => focusedLabels.push(props.accessibilityLabel ?? ''),
    }),
    [props.accessibilityLabel],
  );
  return createElement('Pressable', props, props.children);
});
const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

let platformOS: 'ios' | 'web' = 'web';

mockModule('react-native', {
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  View: ViewHost,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    foregroundPrimary: 'primary',
    foregroundSecondary: 'secondary',
    stateDisabledForeground: 'disabled-foreground',
    stateDisabledSurface: 'disabled-surface',
    stateFocusRing: 'focus-ring',
    stateHover: 'hover',
    statePressed: 'pressed',
    stateSelectedBorder: 'selected-border',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 2: 2 },
  iconSizes: { 20: 20 },
  radius: { 12: 12, full: 999 },
  space: { 4: 4, 12: 12 },
  textStyles: {
    uiCopyM: { fontSize: 14, lineHeight: 20 },
    uiLabelL: { fontSize: 16, lineHeight: 24 },
  },
});

let radioGroupModule: typeof RadioGroupModule | undefined;

before(async () => {
  radioGroupModule = await import('./RadioGroup');
});

beforeEach(() => {
  focusedLabels.length = 0;
  platformOS = 'web';
});

type OptionValue = 'email' | 'push' | 'sms' | 'disabled';
type RadioOption = RadioGroupModule.RadioOption<OptionValue>;

const options: readonly RadioOption[] = [
  { label: '이메일', value: 'email' },
  { disabled: true, label: '푸시', value: 'push' },
  { description: '문자 설명', label: '문자', value: 'sms' },
  { label: '비활성', value: 'disabled' },
];

function renderGroup({
  disabled = false,
  onChange = () => undefined,
  options: renderOptions = options,
  value = 'email' as OptionValue,
}: {
  disabled?: boolean;
  onChange?: (value: OptionValue) => void;
  options?: readonly RadioOption[];
  value?: OptionValue;
} = {}) {
  assert.ok(radioGroupModule);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(
        radioGroupModule!.RadioGroup,
        {
          accessibilityLabel: '알림 방식',
          disabled,
          onChange: onChange as (value: string) => void,
          value,
        },
        renderOptions.map((option) =>
          createElement(radioGroupModule!.RadioOption, { key: option.value, option }),
        ),
      ),
    );
  });
  assert.ok(renderer);
  return renderer;
}

function radioNodes(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType(PressableHost);
}

function radioByLabel(renderer: ReactTestRenderer, label: string) {
  const radio = radioNodes(renderer).find((node) => {
    const accessibilityLabel = node.props.accessibilityLabel as string | undefined;
    return accessibilityLabel === label || accessibilityLabel?.startsWith(`${label}:`);
  });
  assert.ok(radio);
  return radio;
}

function keyEvent(key: string) {
  let prevented = false;
  return {
    event: {
      get defaultPrevented() {
        return prevented;
      },
      key,
      preventDefault: () => {
        prevented = true;
      },
    },
    wasPrevented: () => prevented,
  };
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Object.assign(
    {},
    ...(Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style]),
  );
}

type PressableState = { focused?: boolean; hovered?: boolean; pressed: boolean };

function radioStyle(renderer: ReactTestRenderer, label: string, state: PressableState) {
  const style = radioByLabel(renderer, label).props.style as
    | ((state: PressableState) => unknown)
    | unknown;
  return flattenStyle(typeof style === 'function' ? style(state) : style);
}

test('RadioOption owns canonical presentation and semantic visual states', () => {
  const renderer = renderGroup({ value: 'email' });
  const selected = radioByLabel(renderer, '이메일');
  const indicator = selected
    .findAllByType(ViewHost)
    .find((node) => flattenStyle(node.props.style).width === 20);
  assert.ok(indicator);
  const indicatorStyle = flattenStyle(indicator.props.style);
  assert.equal(indicatorStyle.height, 20);
  assert.equal(indicatorStyle.width, 20);
  assert.equal(indicatorStyle.borderWidth, 2);
  assert.equal(indicatorStyle.borderRadius, 999);

  const dot = indicator
    .findAllByType(ViewHost)
    .find((node) => flattenStyle(node.props.style).width === 10);
  assert.ok(dot);
  const dotStyle = flattenStyle(dot.props.style);
  assert.equal(dotStyle.height, 10);
  assert.equal(dotStyle.width, 10);
  assert.equal(dotStyle.borderRadius, 999);
  assert.equal(indicatorStyle.borderColor, 'selected-border');
  assert.equal(dotStyle.backgroundColor, 'selected-border');

  const content = selected
    .findAllByType(ViewHost)
    .find((node) => flattenStyle(node.props.style).flex === 1);
  assert.ok(content);
  assert.equal(flattenStyle(content.props.style).gap, 4);
  const emailLabel = renderer.root
    .findAllByType(TextHost)
    .find((node) => node.props.children === '이메일');
  assert.ok(emailLabel);
  const labelStyle = flattenStyle(emailLabel.props.style);
  assert.equal(labelStyle.fontSize, 16);
  assert.equal(labelStyle.lineHeight, 24);

  const resting = radioStyle(renderer, '이메일', { pressed: false });
  assert.equal(resting.padding, 12);
  assert.equal(resting.gap, 12);
  assert.equal(resting.borderRadius, 12);
  assert.equal(resting.backgroundColor, undefined);
  assert.equal(
    flattenStyle(
      radioByLabel(renderer, '문자')
        .findAllByType(ViewHost)
        .find((node) => {
          return flattenStyle(node.props.style).width === 20;
        })?.props.style,
    ).borderColor,
    'secondary',
  );
  assert.equal(
    radioStyle(renderer, '문자', { hovered: true, pressed: false }).backgroundColor,
    'hover',
  );
  assert.equal(
    radioStyle(renderer, '문자', { hovered: true, pressed: true }).backgroundColor,
    'pressed',
  );
  assert.equal(
    radioStyle(renderer, '이메일', { focused: true, pressed: false }).backgroundColor,
    undefined,
  );

  const disabledSelected = renderGroup({ value: 'push' });
  const disabledRadio = radioByLabel(disabledSelected, '푸시');
  const disabledIndicator = disabledRadio
    .findAllByType(ViewHost)
    .find((node) => flattenStyle(node.props.style).width === 20);
  assert.ok(disabledIndicator);
  const disabledIndicatorStyle = flattenStyle(disabledIndicator.props.style);
  assert.equal(disabledIndicatorStyle.borderColor, 'disabled-foreground');
  const disabledDot = disabledIndicator
    .findAllByType(ViewHost)
    .find((node) => flattenStyle(node.props.style).width === 10);
  assert.ok(disabledDot);
  assert.equal(flattenStyle(disabledDot.props.style).backgroundColor, 'disabled-foreground');
  assert.equal(
    radioStyle(disabledSelected, '푸시', { hovered: true, pressed: true }).backgroundColor,
    'disabled-surface',
  );
});

test('RadioGroup derives keyboard navigation from rendered RadioOption children', () => {
  const changes: OptionValue[] = [];
  const renderer = renderGroup({ onChange: (value) => changes.push(value) });

  const event = keyEvent('ArrowRight');
  act(() => radioByLabel(renderer, '이메일').props.onKeyDown(event.event));

  assert.equal(event.wasPrevented(), true);
  assert.equal(focusedLabels.at(-1), '문자: 문자 설명');
  assert.deepEqual(changes, ['sms']);
});

test('RadioGroup exposes group and option names, states, and disabled activation', () => {
  const changes: OptionValue[] = [];
  const renderer = renderGroup({ disabled: false, onChange: (value) => changes.push(value) });
  const group = renderer.root.findByType(ViewHost);
  const radios = radioNodes(renderer);

  assert.equal(group.props.accessibilityLabel, '알림 방식');
  assert.equal(group.props.accessibilityRole, 'radiogroup');
  assert.equal(group.props.role, 'radiogroup');
  assert.equal(radios[0]?.props.accessibilityLabel, '이메일');
  assert.equal(radios[2]?.props.accessibilityLabel, '문자: 문자 설명');
  assert.deepEqual(radios[0]?.props.accessibilityState, { checked: true, disabled: false });
  assert.deepEqual(radios[1]?.props.accessibilityState, { checked: false, disabled: true });
  assert.equal(radios[1]?.props.disabled, true);
  assert.equal(radios[1]?.props['aria-checked'], false);
  assert.equal(radios[1]?.props['aria-disabled'], true);

  act(() => radios[1]?.props.onPress());
  assert.deepEqual(changes, []);
  act(() => radios[0]?.props.onPress());
  assert.deepEqual(changes, ['email']);

  const disabledChanges: OptionValue[] = [];
  const disabledGroup = renderGroup({
    disabled: true,
    onChange: (value: OptionValue) => disabledChanges.push(value),
  });
  assert.deepEqual(disabledGroup.root.findByType(ViewHost).props.accessibilityState, {
    disabled: true,
  });
  assert.equal(
    radioNodes(disabledGroup).every((radio) => radio.props.accessibilityState.disabled),
    true,
  );
  act(() => radioNodes(disabledGroup)[0]?.props.onPress());
  assert.deepEqual(disabledChanges, []);
});

test('RadioGroup uses the first enabled option as the Web tab stop fallback', () => {
  const selectedDisabled = renderGroup({ value: 'push' });
  assert.deepEqual(
    radioNodes(selectedDisabled).map((radio) => radio.props.tabIndex),
    [0, -1, -1, -1],
  );
  assert.equal(radioByLabel(selectedDisabled, '푸시').props.accessibilityState.checked, true);

  const unmatched = renderGroup({ value: 'missing' as OptionValue });
  assert.deepEqual(
    radioNodes(unmatched).map((radio) => radio.props.tabIndex),
    [0, -1, -1, -1],
  );
  assert.equal(
    radioNodes(unmatched).some((radio) => radio.props.accessibilityState.checked),
    false,
  );

  const allDisabled = renderGroup({
    options: options.map((option) => ({ ...option, disabled: true })),
  });
  assert.deepEqual(
    radioNodes(allDisabled).map((radio) => radio.props.tabIndex),
    [-1, -1, -1, -1],
  );
  assert.equal(
    radioNodes(allDisabled).every((radio) => radio.props.accessibilityState.disabled),
    true,
  );
});

test('RadioGroup moves forward with ArrowRight and ArrowDown, skipping disabled options and wrapping', () => {
  const changes: OptionValue[] = [];
  const renderer = renderGroup({ onChange: (value) => changes.push(value) });

  for (const [label, key, expected] of [
    ['이메일', 'ArrowRight', '문자: 문자 설명'],
    ['문자', 'ArrowDown', '비활성'],
    ['비활성', 'ArrowRight', '이메일'],
  ] as const) {
    const event = keyEvent(key);
    act(() => radioByLabel(renderer, label).props.onKeyDown(event.event));
    assert.equal(event.wasPrevented(), true);
    assert.equal(focusedLabels.at(-1), expected);
  }

  assert.deepEqual(changes, ['sms', 'disabled', 'email']);
});

test('RadioGroup moves backward with ArrowLeft and ArrowUp, skipping disabled options and wrapping', () => {
  const changes: OptionValue[] = [];
  const renderer = renderGroup({ onChange: (value) => changes.push(value) });

  for (const [label, key, expected] of [
    ['이메일', 'ArrowLeft', '비활성'],
    ['비활성', 'ArrowUp', '문자: 문자 설명'],
    ['문자', 'ArrowLeft', '이메일'],
  ] as const) {
    const event = keyEvent(key);
    act(() => radioByLabel(renderer, label).props.onKeyDown(event.event));
    assert.equal(event.wasPrevented(), true);
    assert.equal(focusedLabels.at(-1), expected);
  }

  assert.deepEqual(changes, ['disabled', 'sms', 'email']);
});

test('RadioGroup omits Web keyboard props on Native', () => {
  platformOS = 'ios';
  const renderer = renderGroup();
  for (const radio of radioNodes(renderer)) {
    assert.equal('onKeyDown' in radio.props, false);
    assert.equal('tabIndex' in radio.props, false);
  }
});
