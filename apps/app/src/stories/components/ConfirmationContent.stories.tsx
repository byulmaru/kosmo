import { StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

type CatalogProps = {
  cancelLabel: string;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  state: 'idle' | 'pending';
  supportingText: string;
  tone: 'danger' | 'primary';
};

function ConfirmationContentCatalog({
  cancelLabel,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  state,
  supportingText,
  tone,
}: CatalogProps) {
  const theme = useTheme();

  return (
    <View style={styles.fixture}>
      <ConfirmationContent
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        message={message}
        onCancel={onCancel}
        onConfirm={onConfirm}
        pending={state === 'pending'}
        supportingContent={
          supportingText ? (
            <Text style={[styles.supporting, { color: theme.foregroundSecondary }]}>
              {supportingText}
            </Text>
          ) : undefined
        }
        tone={tone}
      />
    </View>
  );
}

const meta = {
  args: {
    cancelLabel: '취소',
    confirmLabel: '확인',
    message: '이 작업을 계속할까요?',
    onCancel: fn(),
    onConfirm: fn(),
    state: 'idle',
    supportingText: '',
    tone: 'primary',
  },
  argTypes: {
    state: { control: 'inline-radio', options: ['idle', 'pending'] },
    tone: { control: 'inline-radio', options: ['primary', 'danger'] },
  },
  component: ConfirmationContentCatalog,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Confirmation Content',
} satisfies Meta<typeof ConfirmationContentCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Base: Story = {};

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['tone', 'state', 'message', 'supportingText', 'cancelLabel', 'confirmLabel'],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    args.onCancel.mockClear();
    args.onConfirm.mockClear();
    const canvas = within(canvasElement);
    const cancel = canvas.getByRole('button', { name: args.cancelLabel });
    const confirm = canvas.getByRole('button', { name: args.confirmLabel });

    await step('content와 action state 확인', async () => {
      expect(canvas.getByText(args.message)).toBeVisible();
      if (args.state === 'pending') {
        expect(cancel).toHaveAttribute('aria-disabled', 'true');
        expect(confirm).toHaveAttribute('aria-disabled', 'true');
        expect(confirm).toHaveAttribute('aria-busy', 'true');
      } else {
        expect(cancel).not.toHaveAttribute('aria-disabled', 'true');
        expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
      }
    });

    if (args.state === 'idle') {
      await step('확인과 취소 callback 확인', async () => {
        await userEvent.click(confirm);
        expect(args.onConfirm).toHaveBeenCalledWith();
        await userEvent.click(cancel);
        expect(args.onCancel).toHaveBeenCalledWith();
      });
    }
  },
};

export const Danger: Story = {
  args: {
    confirmLabel: '삭제',
    message: '삭제한 내용은 복구할 수 없습니다.',
    tone: 'danger',
  },
};

export const Pending: Story = {
  args: { ...Danger.args, state: 'pending' },
  play: Playground.play,
};

export const WithSupportingContent: Story = {
  args: { supportingText: '관련된 공유 링크도 더 이상 사용할 수 없습니다.' },
};

const styles = StyleSheet.create({
  fixture: { maxWidth: 420, padding: space[16], width: '100%' },
  supporting: textStyles.uiCopyM,
});
