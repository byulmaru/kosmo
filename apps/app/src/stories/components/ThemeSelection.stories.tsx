import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ThemeSelection } from '@/components/settings/ThemeSelection';
import { Button } from '@/components/ui/Button';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PropsWithChildren } from 'react';
import type { ThemePreference } from '@/components/settings/ThemeSelection';
import type { ThemeMode } from '@/theme/tokens';

type ThemeSelectionCatalogProps = {
  disabled?: boolean;
  mode?: ThemePreference;
  onChange?: (value: ThemePreference) => void;
  systemScheme?: ThemeMode;
};

function ThemeSelectionCatalog({
  disabled = false,
  mode = 'system',
  onChange,
  systemScheme = 'dark',
}: ThemeSelectionCatalogProps) {
  const [value, setValue] = useState<ThemePreference>(mode);
  const resolvedMode = value === 'system' ? systemScheme : value;

  return (
    <ThemeProvider mode={resolvedMode}>
      <View style={styles.fixture}>
        <ThemePreview>
          <ThemeSelection
            disabled={disabled}
            onChange={(nextValue) => {
              setValue(nextValue);
              onChange?.(nextValue);
            }}
            value={value}
          />
        </ThemePreview>
      </View>
    </ThemeProvider>
  );
}

function ThemePreview({ children }: PropsWithChildren) {
  const theme = useTheme();

  return (
    <View
      accessibilityLabel="테마 미리보기"
      style={[styles.preview, { backgroundColor: theme.backgroundCanvas }]}
      testID="theme-preview-surface"
    >
      {children}
      <Text style={[styles.previewLabel, { color: theme.foregroundPrimary }]}>테마 미리보기</Text>
      <Button tone="secondary">대표 버튼</Button>
    </View>
  );
}

const meta = {
  args: {
    disabled: false,
    mode: 'system' as ThemePreference,
    onChange: fn(),
    systemScheme: 'dark' as ThemeMode,
  },
  argTypes: {
    disabled: { control: 'boolean' },
    mode: { control: 'select', options: ['system', 'light', 'dark'] },
    systemScheme: { control: 'select', options: ['light', 'dark'] },
  },
  component: ThemeSelectionCatalog,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Theme Selection',
} satisfies Meta<typeof ThemeSelectionCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const Playground: Story = {
  parameters: {
    controls: { disable: false, include: ['mode', 'systemScheme', 'disabled'] },
  },
  render: (args) => (
    <ThemeSelectionCatalog key={JSON.stringify([args.mode, args.systemScheme])} {...args} />
  ),
  play: async ({ args, canvasElement, step }) => {
    args.onChange?.mockClear();
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', { name: '테마 선택' });
    const system = within(group).getByRole('radio', { name: '시스템' });
    const light = within(group).getByRole('radio', { name: '라이트' });
    const dark = within(group).getByRole('radio', { name: '다크' });
    const preview = canvas.getByTestId('theme-preview-surface');

    await step('시스템 선택과 Dark semantic surface 확인', async () => {
      expect(system).toBeChecked();
      expect(light).not.toBeChecked();
      expect(dark).not.toBeChecked();
      expect(getComputedStyle(preview).backgroundColor).toBe('rgb(0, 0, 0)');
    });

    await step('키보드로 Light 선택과 callback 확인', async () => {
      await userEvent.tab();
      expect(system).toHaveFocus();
      await userEvent.keyboard('{ArrowRight}');
      expect(light).toBeChecked();
      expect(light).toHaveFocus();
      expect(args.onChange).toHaveBeenCalledWith('light');
      expect(getComputedStyle(preview).backgroundColor).toBe('rgb(255, 255, 255)');
    });

    await step('포인터로 Dark 선택과 semantic surface 확인', async () => {
      await userEvent.click(dark);
      expect(dark).toBeChecked();
      expect(args.onChange).toHaveBeenLastCalledWith('dark');
      expect(getComputedStyle(preview).backgroundColor).toBe('rgb(0, 0, 0)');
    });
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Compact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
};

export const Full: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
};

const styles = StyleSheet.create({
  fixture: { gap: 16, width: '100%' },
  preview: { gap: 12, padding: 16 },
  previewLabel: { fontFamily: 'SUIT', fontSize: 16, fontWeight: '600', lineHeight: 24 },
});
