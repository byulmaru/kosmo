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
          options: renderOptions,
          value,
        },
        renderOptions.map((option) =>
          createElement(
            radioGroupModule!.RadioOption,
            { key: option.value, option },
            createElement(TextHost, null, option.label),
          ),
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
