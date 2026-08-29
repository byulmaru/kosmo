import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

type CatalogProps = {
  cancelLabel: string;
  confirmLabel: string;
  dismissible: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  presentation: 'alertdialog' | 'dialog';
  state: 'idle' | 'pending';
  supportingText: string;
  title: string;
  tone: 'danger' | 'primary';
};

function ConfirmationContentCatalog({
  cancelLabel,
  confirmLabel,
  dismissible,
  message,
  onCancel,
  onConfirm,
  onDismiss,
  presentation,
  state,
  supportingText,
  title,
  tone,
}: CatalogProps) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const pending = state === 'pending';
  const closeFromShell = () => {
    onDismiss();
    setVisible(false);
  };

  return (
    <View style={styles.fixture}>
      <Button onPress={() => setVisible(true)}>확인 열기</Button>
      <ModalSheet
        dismissible={dismissible && !pending}
        onClose={closeFromShell}
        role={presentation}
        title={title}
        visible={visible}
      >
        <ConfirmationContent
          cancelLabel={cancelLabel}
          confirmLabel={confirmLabel}
          message={message}
          onCancel={() => {
            onCancel();
            setVisible(false);
          }}
          onConfirm={onConfirm}
          pending={pending}
          supportingContent={
            supportingText ? (
              <Text style={[styles.supporting, { color: theme.foregroundSecondary }]}>
                {supportingText}
              </Text>
            ) : undefined
          }
          tone={tone}
        />
      </ModalSheet>
    </View>
  );
}

const meta = {
  args: {
    cancelLabel: '취소',
    confirmLabel: '확인',
    dismissible: true,
    message: '이 작업을 계속할까요?',
    onCancel: fn(),
    onConfirm: fn(),
    onDismiss: fn(),
    presentation: 'dialog',
    state: 'idle',
    supportingText: '',
    title: '작업 확인',
    tone: 'primary',
  },
  argTypes: {
    presentation: { control: 'inline-radio', options: ['dialog', 'alertdialog'] },
    state: { control: 'inline-radio', options: ['idle', 'pending'] },
    tone: { control: 'inline-radio', options: ['primary', 'danger'] },
  },
  component: ConfirmationContentCatalog,
  excludeStories: ['DismissAndFocusContract', 'PendingContract'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Confirmation Content',
} satisfies Meta<typeof ConfirmationContentCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;
const openConfirmation: Story['play'] = async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: '확인 열기' }));
};

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'presentation',
        'tone',
        'state',
        'title',
        'message',
        'supportingText',
        'cancelLabel',
        'confirmLabel',
        'dismissible',
      ],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    args.onCancel.mockClear();
    args.onConfirm.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '확인 열기' });

    await step('확인 surface 열기와 단일 role 확인', async () => {
      await userEvent.click(trigger);
      const surface = await screen.findByRole(args.presentation, { name: args.title });
      expect(surface).toBeVisible();
      expect(screen.getAllByRole(args.presentation)).toHaveLength(1);
      await waitFor(() =>
        expect(within(surface).getByRole('button', { name: '닫기' })).toHaveFocus(),
      );
    });

    if (args.state === 'pending') {
      await step('Pending action 차단 확인', async () => {
        expect(screen.getByRole('button', { name: args.cancelLabel })).toHaveAttribute(
          'aria-disabled',
          'true',
        );
        expect(screen.getByRole('button', { name: args.confirmLabel })).toHaveAttribute(
          'aria-busy',
          'true',
        );
      });
      return;
    }

    await step('확인과 취소 callback 확인', async () => {
      await userEvent.click(screen.getByRole('button', { name: args.confirmLabel }));
      expect(args.onConfirm).toHaveBeenCalledOnce();
      await userEvent.click(screen.getByRole('button', { name: args.cancelLabel }));
      expect(args.onCancel).toHaveBeenCalledOnce();
      await waitFor(() => expect(trigger).toHaveFocus());
    });
  },
};

export const Danger: Story = {
  args: {
    confirmLabel: '삭제',
    message: '삭제한 내용은 복구할 수 없습니다.',
    presentation: 'alertdialog',
    title: '삭제할까요?',
    tone: 'danger',
  },
  play: openConfirmation,
};

export const Pending: Story = {
  args: { ...Danger.args, state: 'pending' },
  play: openConfirmation,
};

export const WithSupportingContent: Story = {
  args: { supportingText: '관련된 공유 링크도 더 이상 사용할 수 없습니다.' },
  play: openConfirmation,
};

export const Dark: Story = {
  args: Danger.args,
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
  play: openConfirmation,
};

export const DismissAndFocusContract: Story = {
  args: Danger.args,
  globals: { reduceMotion: true },
  play: async ({ args, canvasElement, step }) => {
    args.onDismiss.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '확인 열기' });
    const open = async () => {
      await userEvent.click(trigger);
      return screen.findByRole('alertdialog', { name: args.title });
    };

    await step('초기 focus와 순환', async () => {
      const surface = await open();
      const close = within(surface).getByRole('button', { name: '닫기' });
      const confirm = within(surface).getByRole('button', { name: args.confirmLabel });
      await waitFor(() => expect(close).toHaveFocus());
      await userEvent.tab({ shift: true });
      expect(confirm).toHaveFocus();
      await userEvent.tab();
      expect(close).toHaveFocus();
    });

    await step('Escape dismiss와 trigger focus 복귀', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(args.onDismiss).toHaveBeenCalledOnce();
    });

    await step('Backdrop dismiss와 trigger focus 복귀', async () => {
      await open();
      await userEvent.click(screen.getByTestId('modal-sheet-backdrop'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(args.onDismiss).toHaveBeenCalledTimes(2);
    });
  },
};

export const PendingContract: Story = {
  args: { ...Danger.args, state: 'pending' },
  globals: { reduceMotion: true },
  play: async ({ args, canvasElement, step }) => {
    args.onCancel.mockClear();
    args.onConfirm.mockClear();
    args.onDismiss.mockClear();
    const canvas = within(canvasElement);

    await step('Pending 중 action과 dismiss 차단', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '확인 열기' }));
      const surface = await screen.findByRole('alertdialog', { name: args.title });
      const cancel = within(surface).getByRole('button', { name: args.cancelLabel });
      const confirm = within(surface).getByRole('button', { name: args.confirmLabel });
      const close = within(surface).getByRole('button', { name: '닫기' });
      expect(cancel).toHaveAttribute('aria-disabled', 'true');
      expect(confirm).toHaveAttribute('aria-busy', 'true');
      expect(close).toHaveAttribute('aria-disabled', 'true');
      await waitFor(() => expect(surface).toHaveFocus());
      await userEvent.keyboard('{Escape}');
      const backdrop = screen.getByTestId('modal-sheet-backdrop');
      expect(getComputedStyle(backdrop).pointerEvents).toBe('none');
      backdrop.click();
      confirm.click();
      cancel.click();
      expect(screen.getByRole('alertdialog', { name: args.title })).toBeVisible();
      expect(args.onCancel).not.toHaveBeenCalled();
      expect(args.onConfirm).not.toHaveBeenCalled();
      expect(args.onDismiss).not.toHaveBeenCalled();
    });
  },
};

const styles = StyleSheet.create({
  fixture: { alignItems: 'flex-start', padding: space[16] },
  supporting: textStyles.uiCopyM,
});
