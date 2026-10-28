import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { SearchToolbar } from '@/components/ui/SearchToolbar';
import { colors } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SearchToolbarLeadingAction, SearchToolbarProps } from '@/components/ui/SearchToolbar';

type CatalogProps = SearchToolbarProps;

function SearchToolbarCatalog({
  disabled = false,
  focused: initialFocused = false,
  leadingAction = 'menu',
  leadingControlAriaControls,
  leadingControlExpanded = false,
  leadingControlRef,
  onBackPress,
  onBlur,
  onClear,
  onFocus,
  onMenuPress,
  onSubmit,
  placeholder = '검색어를 입력하세요',
  query: initialQuery = '',
  renderLeadingControl,
}: CatalogProps) {
  const [focused, setFocused] = useState(initialFocused);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => setFocused(initialFocused), [initialFocused]);
  useEffect(() => setQuery(initialQuery), [initialQuery]);

  return (
    <View style={{ width: 390 }}>
      <SearchToolbar
        disabled={disabled}
        focused={focused}
        leadingAction={leadingAction}
        leadingControlAriaControls={leadingControlAriaControls}
        leadingControlExpanded={leadingControlExpanded}
        leadingControlRef={leadingControlRef}
        onBackPress={() => {
          setQuery('');
          setFocused(false);
          onBackPress?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur();
        }}
        onClear={() => {
          setQuery('');
          onClear();
        }}
        onFocus={() => {
          setFocused(true);
          onFocus();
        }}
        onMenuPress={onMenuPress}
        onSubmit={(text) => {
          setQuery(text);
          setFocused(false);
          onSubmit(text);
        }}
        placeholder={placeholder}
        query={query}
        renderLeadingControl={renderLeadingControl}
      />
    </View>
  );
}

const meta = {
  args: {
    disabled: false,
    focused: false,
    leadingAction: 'menu',
    onBackPress: fn(),
    onBlur: fn(),
    onClear: fn(),
    onFocus: fn(),
    onMenuPress: fn(),
    onSubmit: fn(),
    placeholder: '검색어를 입력하세요',
    query: '',
  },
  argTypes: {
    disabled: { control: 'boolean' },
    focused: { control: 'boolean' },
    leadingAction: {
      control: 'inline-radio',
      options: ['back', 'menu', 'none'] satisfies SearchToolbarLeadingAction[],
    },
    placeholder: { control: 'text' },
    query: { control: 'text' },
  },
  component: SearchToolbarCatalog,
  excludeStories: [
    'BackInteractionContract',
    'ClearHoldInteractionContract',
    'DisabledInteractionContract',
    'FocusVisibleInteractionContract',
    'InteractionContract',
    'ReducedMotionContract',
  ],
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
  title: 'KOSMO/Components/Search Toolbar',
} satisfies Meta<typeof SearchToolbarCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

function getInput(canvasElement: HTMLElement) {
  return within(canvasElement).getByRole('textbox', { name: '검색어' });
}

function getButton(canvasElement: HTMLElement, name: string) {
  return within(canvasElement).getByRole('button', { name });
}

function expectTarget(element: HTMLElement, size: number) {
  const rect = element.getBoundingClientRect();
  expect(rect.width).toBe(size);
  expect(rect.height).toBe(size);
}

function expectIcon(element: HTMLElement, size: number) {
  const icon = element.querySelector('svg');
  expect(icon).not.toBeNull();
  expect(icon).toHaveAttribute('width', `${size}`);
  expect(icon).toHaveAttribute('height', `${size}`);
}

function getControlVisual(control: HTMLElement) {
  const visual = control.firstElementChild?.firstElementChild;
  expect(visual).toBeInstanceOf(HTMLElement);
  return visual as HTMLElement;
}

function expectLeadingIcon(
  canvasElement: HTMLElement,
  leadingAction: Exclude<SearchToolbarLeadingAction, 'none'>,
) {
  const label = leadingAction === 'menu' ? '메뉴 열기' : '뒤로';
  const button = getButton(canvasElement, label);
  expectTarget(button, 44);
  expectIcon(button, leadingAction === 'menu' ? 24 : 20);
  return button;
}

export const Playground: Story = {
  args: { query: '코스모' },
  parameters: {
    controls: {
      disable: false,
      include: ['disabled', 'focused', 'leadingAction', 'placeholder', 'query'],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = getInput(canvasElement);
    const toolbar = canvas.getByLabelText('검색');
    const disabled = args.disabled ?? false;
    const leadingAction = args.leadingAction ?? 'menu';
    const leading =
      leadingAction === 'none' ? null : expectLeadingIcon(canvasElement, leadingAction);
    const initialClear = canvas.queryByRole('button', { name: '검색 지우기' });

    await step('검색 입력과 action의 접근성·크기 확인', async () => {
      expect(input).toHaveAccessibleName('검색어');
      expect(toolbar.getBoundingClientRect().height).toBe(64);
      expect(input.parentElement?.getBoundingClientRect().height).toBe(48);
      expect(canvas.queryByRole('button', { name: '메뉴 열기' }) !== null).toBe(
        leadingAction === 'menu',
      );
      expect(canvas.queryByRole('button', { name: '뒤로' }) !== null).toBe(
        leadingAction === 'back',
      );
      expect(initialClear !== null).toBe((args.query ?? '').length > 0);
      if (initialClear) {
        expectTarget(initialClear, 44);
        expectIcon(initialClear, 18);
      }
      if (disabled) {
        expect(input).toHaveAttribute('readonly');
        expect(input).toHaveAttribute('aria-disabled', 'true');
        if (leading) {
          expect(leading).toBeDisabled();
        }
        if (initialClear) {
          expect(initialClear).toBeDisabled();
        }
      } else {
        expect(input).not.toHaveAttribute('readonly');
        if (leading) {
          expect(leading).toBeEnabled();
        }
      }
    });
  },
};

export const InteractionContract: Story = {
  ...Playground,
  args: { ...Playground.args, query: '기존 검색어' },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement, step }) => {
    args.onBackPress?.mockClear();
    args.onBlur.mockClear();
    args.onClear.mockClear();
    args.onFocus.mockClear();
    args.onMenuPress?.mockClear();
    args.onSubmit.mockClear();
    const canvas = within(canvasElement);
    const input = getInput(canvasElement);
    const leadingAction = args.leadingAction ?? 'menu';
    const leading =
      leadingAction === 'none' ? null : expectLeadingIcon(canvasElement, leadingAction);

    await step('입력 이벤트 원문과 leading callback 확인', async () => {
      await userEvent.clear(input);
      await userEvent.type(input, '한글 검색');
      expect(input).toHaveValue('한글 검색');

      await userEvent.keyboard('{Enter}');
      expect(args.onSubmit).toHaveBeenLastCalledWith('한글 검색');

      if (leading) {
        await userEvent.click(leading);
      }
      if (leadingAction === 'menu') {
        expect(args.onMenuPress).toHaveBeenCalledOnce();
        expect(args.onBackPress).not.toHaveBeenCalled();
      } else if (leadingAction === 'back') {
        expect(args.onBackPress).toHaveBeenCalledOnce();
        expect(args.onMenuPress).not.toHaveBeenCalled();
      } else {
        expect(args.onBackPress).not.toHaveBeenCalled();
        expect(args.onMenuPress).not.toHaveBeenCalled();
      }
    });

    await step('지우기 뒤 입력을 비우고 포커스를 유지', async () => {
      const clear = getButton(canvasElement, '검색 지우기');
      await userEvent.click(clear);
      expect(args.onClear).toHaveBeenCalledOnce();
      await waitFor(() => {
        expect(input).toHaveValue('');
        expect(input).toHaveFocus();
      });
      expect(canvas.queryByRole('button', { name: '검색 지우기' })).toBeNull();
    });
  },
};

export const FocusVisibleInteractionContract: Story = {
  args: { query: '코스모' },
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const leading = expectLeadingIcon(canvasElement, 'menu');
    const input = getInput(canvasElement);

    await userEvent.tab();
    expect(leading).toHaveFocus();
    await waitFor(() => expect(getComputedStyle(leading).outlineStyle).toBe('solid'));
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.tab();
    const clear = getButton(canvasElement, '검색 지우기');
    expect(clear).toHaveFocus();
    await waitFor(() => expect(getComputedStyle(clear).outlineStyle).toBe('solid'));
    await userEvent.tab({ shift: true });
    expect(input).toHaveFocus();
  },
};

export const BackInteractionContract: Story = {
  args: { leadingAction: 'back', query: '코스모', focused: true },
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View style={{ width: 390 }}>
      <SearchToolbar {...args} />
    </View>
  ),
  play: async ({ args, canvasElement }) => {
    const input = getInput(canvasElement);
    await userEvent.click(expectLeadingIcon(canvasElement, 'back'));
    expect(args.onBackPress).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(input).toHaveValue('');
      expect(within(canvasElement).queryByRole('button', { name: '검색 지우기' })).toBeNull();
    });
  },
};

export const ClearHoldInteractionContract: Story = {
  args: { focused: true, leadingAction: 'none', query: '코스모' },
  parameters: { controls: { disable: true } },
  render: (args) => (
    <View style={{ width: 390 }}>
      <SearchToolbar {...args} />
    </View>
  ),
  play: async ({ args, canvasElement }) => {
    const user = userEvent.setup();
    const input = getInput(canvasElement);
    await user.click(input);
    await user.type(input, ' 검색');
    const clear = getButton(canvasElement, '검색 지우기');

    await user.pointer({ keys: '[MouseLeft>]', target: clear });
    expect(input).toHaveValue('코스모 검색');
    expect(args.onClear).not.toHaveBeenCalled();

    await user.pointer({
      keys: '[/MouseLeft]',
      target: getButton(canvasElement, '검색 지우기'),
    });
    expect(args.onClear).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
    });
  },
};

export const LeadingActionUnavailable: Story = {
  args: { leadingAction: 'menu', onMenuPress: undefined },
  play: async ({ canvasElement }) => {
    expect(getButton(canvasElement, '메뉴 열기')).toBeDisabled();
    expect(getInput(canvasElement)).toBeEnabled();
  },
};

export const Disabled: Story = {
  args: { disabled: true, query: '비활성 검색어' },
  play: async ({ canvasElement }) => {
    const input = getInput(canvasElement);
    const menu = expectLeadingIcon(canvasElement, 'menu');
    const clear = getButton(canvasElement, '검색 지우기');

    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(menu).toBeDisabled();
    expect(clear).toBeDisabled();
  },
};

export const ReducedMotion: Story = {
  args: { query: '코스모' },
  globals: { reduceMotion: true },
};

export const ReducedMotionContract: Story = {
  args: { query: '코스모' },
  globals: { reduceMotion: true },
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const menu = getButton(canvasElement, '메뉴 열기');
    const visual = getControlVisual(menu);

    await userEvent.pointer({ keys: '[MouseLeft>]', target: menu });
    await waitFor(() =>
      expect(getComputedStyle(visual).backgroundColor).toBe(colors.light.statePressed),
    );
    expect(getComputedStyle(menu).transform).toBe('none');
    expectTarget(menu, 44);
    await userEvent.pointer({ keys: '[/MouseLeft]', target: menu });
    expect(getComputedStyle(visual).transitionDuration).toBe('0s');
  },
};

export const DisabledInteractionContract: Story = {
  args: { disabled: true, query: '비활성 검색어' },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    const input = getInput(canvasElement);
    const menu = expectLeadingIcon(canvasElement, 'menu');
    const clear = getButton(canvasElement, '검색 지우기');

    await userEvent.type(input, '변경');
    await userEvent.keyboard('{Enter}');
    menu.click();
    clear.click();
    expect(input).toHaveValue('비활성 검색어');
    expect(args.onFocus).not.toHaveBeenCalled();
    expect(args.onSubmit).not.toHaveBeenCalled();
    expect(args.onMenuPress).not.toHaveBeenCalled();
    expect(args.onClear).not.toHaveBeenCalled();
  },
};
