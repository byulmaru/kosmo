import { SearchIcon, XIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { TextInput } from 'react-native';

type SearchFieldArgs = {
  accessibilityLabel: string;
  containerWidth: number;
  disabled: boolean;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onFocus: () => void;
  placeholder: string;
  value: string;
};

// Consumer-owned composition of production primitives; no route/search lifecycle.
function SearchFieldComposition({
  accessibilityLabel,
  containerWidth,
  disabled,
  onBlur,
  onChangeText,
  onClear,
  onFocus,
  placeholder,
  value: initialValue,
}: SearchFieldArgs) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);

  return (
    <View style={{ maxWidth: '100%', width: containerWidth }}>
      <TextField
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="search"
        accessibilityState={{ disabled }}
        aria-disabled={disabled}
        editable={!disabled}
        onBlur={onBlur}
        onChangeText={(next) => {
          setValue(next);
          onChangeText(next);
        }}
        onFocus={onFocus}
        placeholder={placeholder}
        ref={inputRef}
        role={Platform.OS === 'web' ? 'searchbox' : undefined}
        style={styles.input}
        value={value}
      />
      <View
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={styles.leading}
      >
        <SearchIcon
          color={disabled ? theme.stateDisabledForeground : theme.foregroundPrimary}
          size={20}
        />
      </View>
      {value.length > 0 && !disabled ? (
        <IconButton
          accessibilityLabel="검색 지우기"
          onPress={() => {
            setValue('');
            onClear();
            inputRef.current?.focus();
          }}
          style={styles.clear}
          targetSize={32}
        >
          <XIcon color={theme.foregroundPrimary} size={20} />
        </IconButton>
      ) : null}
    </View>
  );
}

const meta = {
  args: {
    accessibilityLabel: '검색어',
    containerWidth: 320,
    disabled: false,
    onBlur: fn(),
    onChangeText: fn(),
    onClear: fn(),
    onFocus: fn(),
    placeholder: '설정 검색',
    value: '',
  },
  argTypes: {
    accessibilityLabel: { control: 'text' },
    containerWidth: { control: { max: 640, min: 240, step: 40, type: 'range' } },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
    value: { control: 'text' },
  },
  component: SearchFieldComposition,
  excludeStories: ['InputClearAndFocus', 'DisabledContract'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Patterns/Search Field',
} satisfies Meta<typeof SearchFieldComposition>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['accessibilityLabel', 'containerWidth', 'disabled', 'placeholder', 'value'],
    },
  },
};

export const RepresentativeStates: Story = {
  render: (args) => (
    <View style={{ gap: space[16] }}>
      <SearchFieldComposition {...args} accessibilityLabel="입력된 검색어" value="알림" />
      <SearchFieldComposition {...args} accessibilityLabel="비활성 빈 검색어" disabled value="" />
      <SearchFieldComposition {...args} accessibilityLabel="비활성 검색어" disabled value="알림" />
      <SearchFieldComposition
        {...args}
        accessibilityLabel="긴 검색어"
        value="아주 긴 검색어가 입력되어도 지우기 버튼과 겹치지 않는 검색 필드"
      />
    </View>
  ),
};

export const InputClearAndFocus: Story = {
  play: async ({ args, canvasElement, step }) => {
    args.onBlur.mockClear();
    args.onChangeText.mockClear();
    args.onClear.mockClear();
    args.onFocus.mockClear();
    const canvas = within(canvasElement);
    const input = canvas.getByRole('searchbox', { name: args.accessibilityLabel });

    await step('Empty와 keyboard focus', async () => {
      expect(input).toHaveValue('');
      expect(input.getBoundingClientRect().height).toBe(44);
      expect(canvas.queryByRole('button', { name: '검색 지우기' })).toBeNull();
      await userEvent.tab();
      expect(input).toHaveFocus();
      expect(args.onFocus).toHaveBeenCalled();
      expect(getComputedStyle(input).outlineStyle).toBe('solid');
    });

    await step('Filled 입력과 clear 뒤 focus 복귀', async () => {
      await userEvent.type(input, '알림');
      expect(input).toHaveValue('알림');
      expect(args.onChangeText).toHaveBeenLastCalledWith('알림');
      await userEvent.tab();
      const clear = canvas.getByRole('button', { name: '검색 지우기' });
      expect(clear).toHaveFocus();
      expect(args.onBlur).toHaveBeenCalled();
      await userEvent.keyboard('{Enter}');
      expect(args.onClear).toHaveBeenCalledOnce();
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
      expect(canvas.queryByRole('button', { name: '검색 지우기' })).toBeNull();
    });
  },
};

export const DisabledContract: Story = {
  args: { disabled: true, value: '알림' },
  play: async ({ args, canvasElement }) => {
    args.onChangeText.mockClear();
    args.onClear.mockClear();
    const canvas = within(canvasElement);
    const input = canvas.getByRole('searchbox', { name: args.accessibilityLabel });
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-disabled', 'true');
    expect(canvas.queryByRole('button', { name: '검색 지우기' })).toBeNull();
    await userEvent.type(input, '변경');
    expect(input).toHaveValue('알림');
    expect(args.onChangeText).not.toHaveBeenCalled();
    expect(args.onClear).not.toHaveBeenCalled();
  },
};

const styles = StyleSheet.create({
  input: { paddingLeft: space[32] + space[8], paddingRight: space[48] },
  leading: { left: space[12], pointerEvents: 'none', position: 'absolute', top: space[12] },
  clear: { position: 'absolute', right: space[8], top: (44 - 32) / 2 },
});
