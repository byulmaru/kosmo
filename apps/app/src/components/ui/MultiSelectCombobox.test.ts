import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as MultiSelectComboboxModule from './MultiSelectCombobox';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HostProps = {
  children?: ReactNode;
  style?: unknown;
};

const host = (name: string) => (props: HostProps) =>
  createElement(name as unknown as ElementType, props, props.children);

const IconButtonHost = host('IconButton');
const ListboxOptionHost = host('ListboxOption');
const ProfileTagChipHost = host('ProfileTagChip');
const TextFieldHost = host('TextField');
const PressableHost = host('Pressable');
const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;
const TextInputHost = 'TextInput' as unknown as ElementType;

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
  TextInput: TextInputHost,
  View: ViewHost,
});
mockModule(require.resolve('lucide-react-native'), {
  Search: host('Search'),
  X: host('X'),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundElevated: 'elevated',
    backgroundSurface: 'surface',
    borderDefault: 'border',
    borderSubtle: 'subtle-border',
    foregroundPrimary: 'primary',
    foregroundSecondary: 'secondary',
    foregroundMuted: 'muted',
    stateDisabledForeground: 'disabled-foreground',
    stateDisabledSurface: 'disabled-surface',
    stateFocusRing: 'focus-ring',
    stateHover: 'hover',
    statePressed: 'pressed',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1, 2: 2 },
  iconSizes: { 20: 20 },
  radius: { 8: 8, 12: 12, full: 999 },
  space: { 0: 0, 4: 4, 8: 8, 12: 12, 16: 16, 48: 48 },
  textStyles: {
    uiCopyM: {},
    uiLabelM: {},
    uiLabelL: {},
  },
});
mockModule('@/components/profile/ProfileTagChip', {
  ProfileTagChip: ProfileTagChipHost,
});
mockModule('@/components/ui/IconButton', {
  ICON_BUTTON_TARGET_SIZE: 48,
  IconButton: IconButtonHost,
});
mockModule('@/components/ui/ListboxOption', {
  ListboxOption: ListboxOptionHost,
});
mockModule('@/components/ui/TextField', {
  TextField: TextFieldHost,
});

let multiSelectComboboxModule: typeof MultiSelectComboboxModule | undefined;

before(async () => {
  multiSelectComboboxModule = await import('./MultiSelectCombobox');
});

beforeEach(() => {
  platformOS = 'web';
});

type Option = MultiSelectComboboxModule.MultiSelectOption;

const options: Option[] = [
  { label: '공개 이름', value: 'public' },
  { disabled: true, label: '사용 중지됨', value: 'disabled' },
  { label: '프로필 소개', value: 'bio' },
];

function renderCombobox(
  overrides: Partial<MultiSelectComboboxModule.MultiSelectComboboxProps> = {},
) {
  assert.ok(multiSelectComboboxModule);
  const props: MultiSelectComboboxModule.MultiSelectComboboxProps = {
    emptyMessage: '일치하는 항목이 없습니다.',
    onQueryChange: () => undefined,
    onSelectedOptionsChange: () => undefined,
    options,
    placeholder: '검색어를 입력하세요',
    query: '',
    searchLabel: '항목 검색',
    selectedLabel: '선택된 항목',
    selectedOptions: [options[0]],
    ...overrides,
  };
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(multiSelectComboboxModule!.MultiSelectCombobox, props));
  });
  assert.ok(renderer);
  return renderer;
}

function inputNode(renderer: ReactTestRenderer) {
  return renderer.root.findByType(TextFieldHost);
}

function optionNodes(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType(ListboxOptionHost);
}

test('opens its controlled listbox on focus and selects the next enabled option', () => {
  let selectedOptions: readonly Option[] | undefined;
  const renderer = renderCombobox({
    onSelectedOptionsChange: (next) => {
      selectedOptions = next;
    },
  });
  const input = inputNode(renderer);

  assert.equal(input.props.role, 'combobox');
  assert.equal(input.props.accessibilityLabel, '항목 검색');
  assert.equal(input.props['aria-expanded'], false);
  assert.equal(input.props['aria-autocomplete'], 'list');
  assert.equal(input.props.label, undefined);
  assert.equal(
    Object.assign({}, ...(input.props.style as Array<Record<string, unknown>>)).paddingLeft,
    48,
  );
  assert.equal(renderer.root.findAllByType(ProfileTagChipHost)[0].props.label, '공개 이름');

  act(() => input.props.onFocus({}));
  assert.equal(inputNode(renderer).props['aria-expanded'], true);
  assert.equal(
    renderer.root.findByProps({ role: 'listbox' }).props.accessibilityLabel,
    '항목 검색 결과',
  );

  act(() => inputNode(renderer).props.onKeyPress({ nativeEvent: { key: 'ArrowDown' } }));
  assert.equal(optionNodes(renderer)[0].props.active, false);
  assert.equal(optionNodes(renderer)[1].props.disabled, true);
  assert.equal(optionNodes(renderer)[2].props.active, true);
  assert.match(inputNode(renderer).props['aria-activedescendant'], /option-2$/);

  act(() => inputNode(renderer).props.onKeyPress({ nativeEvent: { key: 'Enter' } }));
  assert.deepEqual(selectedOptions, [options[0], options[2]]);
  assert.equal(inputNode(renderer).props['aria-expanded'], false);
});

test('clears the query, removes a selected chip, and ignores editing while disabled', () => {
  let clearedQuery: string | undefined;
  let removedOptions: readonly Option[] | undefined;
  const renderer = renderCombobox({
    onQueryChange: (next) => {
      clearedQuery = next;
    },
    onSelectedOptionsChange: (next) => {
      removedOptions = next;
    },
    query: '공개',
  });

  const clearButton = renderer.root.findByType(IconButtonHost);
  assert.equal(clearButton.props.targetSize, undefined);
  assert.equal(clearButton.props.style.top, -2);

  act(() => renderer.root.findByType(IconButtonHost).props.onPress());
  assert.equal(clearedQuery, '');
  act(() => renderer.root.findByType(ProfileTagChipHost).props.onRemove());
  assert.deepEqual(removedOptions, []);

  let changed = false;
  const disabledRenderer = renderCombobox({
    disabled: true,
    onQueryChange: () => {
      changed = true;
    },
    query: '공개',
  });
  const disabledInput = inputNode(disabledRenderer);
  act(() => disabledInput.props.onChangeText('다른 값'));
  assert.equal(changed, false);
  assert.equal(disabledInput.props.editable, false);
  assert.equal(disabledInput.props['aria-disabled'], true);
  assert.equal(disabledRenderer.root.findByType(ProfileTagChipHost).props.disabled, true);
  assert.equal(disabledRenderer.root.findByType(IconButtonHost).props.disabled, true);
});

test('renders an empty state and invokes the current-query create action', () => {
  let createdQuery: string | undefined;
  const renderer = renderCombobox({
    onCreateOption: (query) => {
      createdQuery = query;
    },
    options: [],
    query: '새 항목',
  });
  const input = inputNode(renderer);

  act(() => input.props.onFocus({}));
  const listbox = renderer.root.findByProps({ role: 'listbox' });
  assert.equal(
    renderer.root.findAllByType(TextHost).some((node) => node.props.children === '새 항목 추가'),
    false,
  );
  assert.equal(
    renderer.root
      .findAllByType(TextHost)
      .some((node) => node.props.children === '일치하는 항목이 없습니다.'),
    true,
  );
  assert.equal(
    listbox
      .findAllByType(TextHost)
      .some((node) => node.props.children === '일치하는 항목이 없습니다.'),
    false,
  );
  const status = renderer.root
    .findAllByType(TextHost)
    .find((node) => node.props.children === '일치하는 항목이 없습니다.');
  const surface = listbox.parent;
  assert.ok(status);
  assert.ok(surface);
  assert.equal(status.parent, surface);
  assert.ok(surface.children.indexOf(status) < surface.children.indexOf(listbox));

  const createAction = optionNodes(renderer).find((node) => node.props.label === '새 항목 추가');
  assert.ok(createAction);
  assert.equal(createAction.props.accessibilityLabel, undefined);
  assert.equal(createAction.props.active, true);
  assert.equal(inputNode(renderer).props['aria-activedescendant'], createAction.props.nativeID);
  act(() => createAction.props.onSelect());
  assert.equal(createdQuery, '새 항목');

  const keyboardRenderer = renderCombobox({
    onCreateOption: (query) => {
      createdQuery = query;
    },
    options: [],
    query: '키보드 항목',
  });
  act(() => inputNode(keyboardRenderer).props.onFocus({}));
  act(() => inputNode(keyboardRenderer).props.onKeyPress({ nativeEvent: { key: 'Enter' } }));
  assert.equal(createdQuery, '키보드 항목');
  assert.equal(inputNode(keyboardRenderer).props['aria-expanded'], false);
});

test('reconciles the active row when controlled results are replaced or shortened', () => {
  assert.ok(multiSelectComboboxModule);
  const initialOptions = [options[0], options[2]];
  const baseProps: MultiSelectComboboxModule.MultiSelectComboboxProps = {
    onQueryChange: () => undefined,
    onSelectedOptionsChange: () => undefined,
    options: initialOptions,
    query: '',
    searchLabel: '항목 검색',
    selectedLabel: '선택된 항목',
    selectedOptions: [],
  };
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(multiSelectComboboxModule!.MultiSelectCombobox, baseProps));
  });
  assert.ok(renderer);
  const rendered = renderer;
  act(() => inputNode(rendered).props.onFocus({}));
  act(() => inputNode(rendered).props.onKeyPress({ nativeEvent: { key: 'ArrowDown' } }));
  assert.equal(optionNodes(rendered)[1].props.active, true);

  const sameLengthReplacement = [
    { label: '새 결과 1', value: 'new-1' },
    { label: '새 결과 2', value: 'new-2' },
  ];
  act(() => {
    rendered.update(
      createElement(multiSelectComboboxModule!.MultiSelectCombobox, {
        ...baseProps,
        options: sameLengthReplacement,
        query: '새',
      }),
    );
  });
  assert.equal(optionNodes(rendered)[0].props.active, true);
  assert.equal(optionNodes(rendered)[1].props.active, false);
  assert.match(inputNode(rendered).props['aria-activedescendant'], /option-0$/);

  act(() => inputNode(rendered).props.onKeyPress({ nativeEvent: { key: 'ArrowDown' } }));
  act(() => {
    rendered.update(
      createElement(multiSelectComboboxModule!.MultiSelectCombobox, {
        ...baseProps,
        options: sameLengthReplacement,
        query: '새 결과',
      }),
    );
  });
  assert.equal(optionNodes(rendered)[0].props.active, true);
  assert.equal(optionNodes(rendered)[1].props.active, false);

  const replacement = [{ label: '새 결과', value: 'new' }];
  act(() => {
    rendered.update(
      createElement(multiSelectComboboxModule!.MultiSelectCombobox, {
        ...baseProps,
        options: replacement,
        query: '새',
      }),
    );
  });
  assert.equal(optionNodes(rendered)[0].props.active, true);
  assert.match(inputNode(rendered).props['aria-activedescendant'], /option-0$/);

  const disabledOnly = [{ disabled: true, label: '결과 없음', value: 'disabled-only' }];
  act(() => {
    rendered.update(
      createElement(multiSelectComboboxModule!.MultiSelectCombobox, {
        ...baseProps,
        options: disabledOnly,
        query: '없음',
      }),
    );
  });
  assert.equal(optionNodes(rendered)[0].props.active, false);
  assert.equal(inputNode(rendered).props['aria-activedescendant'], undefined);
});

test('reopens on the last enabled row after Escape and ArrowUp', () => {
  let selectedOptions: readonly Option[] | undefined;
  const renderer = renderCombobox({
    onSelectedOptionsChange: (next) => {
      selectedOptions = next;
    },
  });
  const input = inputNode(renderer);

  act(() => input.props.onFocus({}));
  act(() => inputNode(renderer).props.onKeyPress({ nativeEvent: { key: 'Escape' } }));
  assert.equal(inputNode(renderer).props['aria-expanded'], false);
  assert.equal(inputNode(renderer).props['aria-activedescendant'], undefined);

  act(() => inputNode(renderer).props.onKeyPress({ nativeEvent: { key: 'ArrowUp' } }));
  assert.equal(inputNode(renderer).props['aria-expanded'], true);
  assert.equal(optionNodes(renderer)[0].props.active, false);
  assert.equal(optionNodes(renderer)[1].props.active, false);
  assert.equal(optionNodes(renderer)[2].props.active, true);
  assert.match(inputNode(renderer).props['aria-activedescendant'], /option-2$/);

  act(() => inputNode(renderer).props.onKeyPress({ nativeEvent: { key: 'Enter' } }));
  assert.deepEqual(selectedOptions, [options[0], options[2]]);
  assert.equal(inputNode(renderer).props['aria-expanded'], false);
});

test('does not activate an option while the Enter key is composing', () => {
  let selected = 0;
  const renderer = renderCombobox({ onSelectedOptionsChange: () => selected++ });
  act(() => inputNode(renderer).props.onFocus({}));
  act(() =>
    inputNode(renderer).props.onKeyPress({
      nativeEvent: { isComposing: true, key: 'Enter' },
    }),
  );

  assert.equal(selected, 0);
  assert.equal(inputNode(renderer).props['aria-expanded'], true);
});
