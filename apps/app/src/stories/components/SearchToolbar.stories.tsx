import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { SearchToolbar } from '@/components/ui/SearchToolbar';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SearchToolbarLeadingAction, SearchToolbarProps } from '@/components/ui/SearchToolbar';

type CatalogProps = SearchToolbarProps;

function SearchToolbarCatalog({
  disabled = false,
  leadingAction = 'menu',
  onBackPress,
  onChangeText,
  onClear,
  onMenuPress,
  onSubmit,
  placeholder = '검색어를 입력하세요',
  platform = 'web',
  value: initialValue = '',
}: CatalogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => setValue(initialValue), [initialValue]);

  return (
    <View style={{ width: 390 }}>
      <SearchToolbar
        disabled={disabled}
        leadingAction={leadingAction}
        onBackPress={onBackPress}
        onChangeText={(nextValue) => {
          setValue(nextValue);
          onChangeText(nextValue);
        }}
        onClear={() => {
          setValue('');
          onClear();
        }}
        onMenuPress={onMenuPress}
        onSubmit={onSubmit}
        placeholder={placeholder}
        platform={platform}
        value={value}
      />
    </View>
  );
}

const meta = {
  args: {
    disabled: false,
    leadingAction: 'menu',
    onBackPress: fn(),
    onChangeText: fn(),
    onClear: fn(),
    onMenuPress: fn(),
    onSubmit: fn(),
    placeholder: '검색어를 입력하세요',
    platform: 'web',
    value: '',
  },
  argTypes: {
    disabled: { control: 'boolean' },
    leadingAction: {
      control: 'inline-radio',
      options: ['back', 'menu', 'none'] satisfies SearchToolbarLeadingAction[],
    },
    placeholder: { control: 'text' },
    platform: {
      control: 'inline-radio',
      options: ['web', 'ios', 'android'],
    },
    value: { control: 'text' },
  },
  component: SearchToolbarCatalog,
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
  const visual = control.firstElementChild;
  expect(visual).toBeInstanceOf(HTMLElement);
  return visual as HTMLElement;
}

function expectLeadingIcon(
  canvasElement: HTMLElement,
  leadingAction: Exclude<SearchToolbarLeadingAction, 'none'>,
  targetSize: number,
) {
  const label = leadingAction === 'menu' ? '메뉴 열기' : '뒤로';
  const button = getButton(canvasElement, label);
  expectTarget(button, targetSize);
  expectIcon(button, leadingAction === 'menu' ? 24 : 20);
  return button;
}

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const input = getInput(canvasElement);
    const menu = expectLeadingIcon(canvasElement, 'menu', 44);

    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '검색어를 입력하세요');
    expect(within(canvasElement).queryByRole('button', { name: '뒤로' })).toBeNull();
    expect(within(canvasElement).queryByRole('button', { name: '검색 지우기' })).toBeNull();
    menu.focus();
    expect(menu).toHaveFocus();
  },
};

export const Playground: Story = {
  args: { value: '코스모' },
  parameters: {
    controls: {
      disable: false,
      include: ['disabled', 'leadingAction', 'placeholder', 'platform', 'value'],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    args.onBackPress?.mockClear();
    args.onChangeText.mockClear();
    args.onClear.mockClear();
    args.onMenuPress?.mockClear();
    args.onSubmit.mockClear();
    const input = getInput(canvasElement);
    const disabled = args.disabled ?? false;
    const leadingAction = args.leadingAction ?? 'menu';
    const platform = args.platform ?? 'web';
    const targetSize = platform === 'android' ? 48 : 44;
    const leading =
      leadingAction === 'back'
        ? expectLeadingIcon(canvasElement, 'back', targetSize)
        : leadingAction === 'menu' && platform === 'web'
          ? expectLeadingIcon(canvasElement, 'menu', targetSize)
          : null;
    const initialClear = within(canvasElement).queryByRole('button', { name: '검색 지우기' });

    await step('Controls 조합과 geometry 확인', async () => {
      expect(input).toHaveAccessibleName('검색어');
      expect(within(canvasElement).queryByRole('button', { name: '메뉴 열기' }) !== null).toBe(
        leadingAction === 'menu' && platform === 'web',
      );
      expect(within(canvasElement).queryByRole('button', { name: '뒤로' }) !== null).toBe(
        leadingAction === 'back',
      );
      expect(initialClear !== null).toBe((args.value ?? '').length > 0);
      if (initialClear) {
        expectTarget(initialClear, targetSize);
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

    if (disabled) {
      return;
    }

    await step('Pointer와 keyboard focus feedback 확인', async () => {
      if (platform !== 'web' || leadingAction !== 'menu' || !leading) {
        return;
      }

      await userEvent.hover(leading);
      await userEvent.pointer({ keys: '[MouseLeft>]', target: leading });
      const visual = getControlVisual(leading);
      await waitFor(() =>
        expect(getComputedStyle(visual).transform).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)'),
      );
      expect(getComputedStyle(visual).transitionDuration).toBe('0.12s');
      expect(getComputedStyle(leading).transform).toBe('none');
      expectTarget(leading, 44);
      expect(leading).toHaveFocus();
      await userEvent.pointer({ keys: '[/MouseLeft]', target: leading });
      leading.blur();
      await userEvent.tab();
      expect(leading).toHaveFocus();
      await waitFor(() => expect(getComputedStyle(leading).outlineStyle).toBe('solid'));
      await userEvent.tab();
      expect(input).toHaveFocus();
    });

    await step('입력·leading action·Clear callback 확인', async () => {
      await userEvent.clear(input);
      await userEvent.type(input, '코스모');
      expect(input).toHaveValue('코스모');
      expect(args.onChangeText).toHaveBeenLastCalledWith('코스모');

      await userEvent.keyboard('{Enter}');
      expect(args.onSubmit).toHaveBeenLastCalledWith('코스모');

      if (leading) {
        await userEvent.click(leading);
      }
      if (leadingAction === 'menu' && platform === 'web') {
        expect(args.onMenuPress).toHaveBeenCalledOnce();
        expect(args.onBackPress).not.toHaveBeenCalled();
      } else if (leadingAction === 'back') {
        expect(args.onBackPress).toHaveBeenCalledOnce();
        expect(args.onMenuPress).not.toHaveBeenCalled();
      } else {
        expect(args.onBackPress).not.toHaveBeenCalled();
        expect(args.onMenuPress).not.toHaveBeenCalled();
      }

      const clear = getButton(canvasElement, '검색 지우기');
      expectTarget(clear, targetSize);
      expectIcon(clear, 18);

      await userEvent.click(clear);
      expect(args.onClear).toHaveBeenCalledOnce();
      await waitFor(() => {
        expect(input).toHaveValue('');
        expect(input).toHaveFocus();
      });
      expect(within(canvasElement).queryByRole('button', { name: '검색 지우기' })).toBeNull();
    });
  },
};

export const ReducedMotion: Story = {
  args: { value: '코스모' },
  globals: { reduceMotion: true },
  play: async ({ canvasElement }) => {
    const menu = getButton(canvasElement, '메뉴 열기');
    const visual = getControlVisual(menu);

    await userEvent.pointer({ keys: '[MouseLeft>]', target: menu });
    expect(getComputedStyle(visual).transform).toBe('none');
    expect(getComputedStyle(visual).transitionDuration).toBe('0s');
    expect(getComputedStyle(menu).transform).toBe('none');
    expectTarget(menu, 44);
    await userEvent.pointer({ keys: '[/MouseLeft]', target: menu });
  },
};

export const IosBack: Story = {
  args: { leadingAction: 'back', platform: 'ios' },
  play: async ({ args, canvasElement }) => {
    const back = expectLeadingIcon(canvasElement, 'back', 44);
    const input = getInput(canvasElement);

    expect(input).toBeEnabled();
    expect(within(canvasElement).queryByRole('button', { name: '메뉴 열기' })).toBeNull();
    expect(within(canvasElement).queryByRole('button', { name: '검색 지우기' })).toBeNull();
    await userEvent.click(back);
    expect(args.onBackPress).toHaveBeenCalledOnce();
    expect(args.onMenuPress).not.toHaveBeenCalled();
  },
};

export const AndroidBack: Story = {
  args: { leadingAction: 'back', platform: 'android' },
  play: async ({ args, canvasElement }) => {
    const back = expectLeadingIcon(canvasElement, 'back', 48);

    expect(within(canvasElement).queryByRole('button', { name: '메뉴 열기' })).toBeNull();
    await userEvent.click(back);
    expect(args.onBackPress).toHaveBeenCalledOnce();
    expect(args.onMenuPress).not.toHaveBeenCalled();
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
  args: { disabled: true, value: '비활성 검색어' },
  play: async ({ args, canvasElement }) => {
    const input = getInput(canvasElement);
    const menu = expectLeadingIcon(canvasElement, 'menu', 44);
    const clear = getButton(canvasElement, '검색 지우기');

    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(menu).toBeDisabled();
    expect(clear).toBeDisabled();
    await userEvent.type(input, '변경');
    await userEvent.keyboard('{Enter}');
    menu.click();
    clear.click();
    expect(args.onChangeText).not.toHaveBeenCalled();
    expect(args.onSubmit).not.toHaveBeenCalled();
    expect(args.onMenuPress).not.toHaveBeenCalled();
    expect(args.onClear).not.toHaveBeenCalled();
  },
};

export const Dark: Story = {
  args: { leadingAction: 'none', value: '다크 검색어' },
  globals: {
    backgrounds: { value: 'kosmoDark' },
    theme: 'dark',
  },
};
