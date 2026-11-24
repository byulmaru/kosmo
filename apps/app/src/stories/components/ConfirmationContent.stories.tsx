import { StyleSheet, Text, View } from 'react-native';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

type CatalogProps = {
  cancelLabel: string;
  confirmDisabled: boolean;
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
  confirmDisabled,
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
        confirmDisabled={confirmDisabled}
        confirmLabel={confirmLabel}
        message={message}
        onCancel={onCancel}
        onConfirm={onConfirm}
        pending={state === 'pending'}
        tone={tone}
      >
        {supportingText ? (
          <Text style={[styles.supporting, { color: theme.foregroundSecondary }]}>
            {supportingText}
          </Text>
        ) : undefined}
      </ConfirmationContent>
    </View>
  );
}

const meta = {
  args: {
    cancelLabel: '취소',
    confirmDisabled: false,
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
  excludeStories: ['InteractionContract'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Confirmation Content',
} satisfies Meta<typeof ConfirmationContentCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'tone',
        'state',
        'message',
        'supportingText',
        'cancelLabel',
        'confirmLabel',
        'confirmDisabled',
      ],
    },
  },
  play: async ({ args, canvasElement, step }) => {
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
        if (args.confirmDisabled) {
          expect(confirm).toHaveAttribute('aria-disabled', 'true');
        } else {
          expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
        }
      }
    });
  },
};

export const InteractionContract: Story = {
  args: { confirmDisabled: true },
  play: async ({ args, canvasElement, step }) => {
    args.onCancel.mockClear();
    args.onConfirm.mockClear();
    const canvas = within(canvasElement);
    const cancel = canvas.getByRole('button', { name: args.cancelLabel });
    const confirm = canvas.getByRole('button', { name: args.confirmLabel });

    await step('비활성 확인과 취소 action 확인', async () => {
      expect(confirm).toHaveAttribute('aria-disabled', 'true');
      cancel.focus();
      await userEvent.tab();
      expect(confirm).not.toHaveFocus();
      await fireEvent.click(confirm);
      expect(args.onConfirm).not.toHaveBeenCalled();

      await userEvent.click(cancel);
      expect(args.onCancel).toHaveBeenCalledTimes(1);
      expect(args.onConfirm).not.toHaveBeenCalled();
    });
  },
};

export const Danger: Story = {
  args: {
    confirmLabel: '삭제',
    message: '삭제한 내용은 복구할 수 없습니다.',
    tone: 'danger',
  },
  play: async ({ args, canvasElement }) => {
    args.onConfirm.mockClear();
    const confirm = within(canvasElement).getByRole('button', { name: args.confirmLabel });
    await userEvent.click(confirm);
    expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};

export const Pending: Story = {
  args: { ...Danger.args, state: 'pending' },
  play: async ({ args, canvasElement, step }) => {
    args.onCancel.mockClear();
    args.onConfirm.mockClear();
    const canvas = within(canvasElement);
    const cancel = canvas.getByRole('button', { name: args.cancelLabel });
    const confirm = canvas.getByRole('button', { name: args.confirmLabel });

    await step('처리 중에는 두 action을 실행할 수 없음', async () => {
      expect(cancel).toHaveAttribute('aria-disabled', 'true');
      expect(confirm).toHaveAttribute('aria-disabled', 'true');
      expect(confirm).toHaveAttribute('aria-busy', 'true');

      await userEvent.tab();
      expect(confirm).not.toHaveFocus();
      expect(cancel).not.toHaveFocus();
      await fireEvent.click(confirm);
      await fireEvent.click(cancel);
      expect(args.onConfirm).not.toHaveBeenCalled();
      expect(args.onCancel).not.toHaveBeenCalled();
    });
  },
};

export const WithSupportingContent: Story = {
  args: { supportingText: '관련된 공유 링크도 더 이상 사용할 수 없습니다.' },
  play: async ({ args, canvasElement }) => {
    expect(within(canvasElement).getByText(args.supportingText)).toBeVisible();
  },
};

const styles = StyleSheet.create({
  fixture: { maxWidth: 420, padding: space[16], width: '100%' },
  supporting: textStyles.uiCopyM,
});
