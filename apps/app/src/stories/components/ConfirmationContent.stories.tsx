import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  interactiveSupporting?: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  role: 'alertdialog' | 'dialog';
  state: 'idle' | 'pending';
  supportingText: string;
  title: string;
  tone: 'danger' | 'primary';
};

function ConfirmationContentCatalog({
  cancelLabel,
  confirmLabel,
  interactiveSupporting = false,
  message,
  onCancel,
  onConfirm,
  onDismiss,
  role,
  state,
  supportingText,
  title,
  tone,
}: CatalogProps) {
  const [visible, setVisible] = useState(false);
  const [supportingChecked, setSupportingChecked] = useState(false);
  const cancelControlRef = useRef<View>(null);
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
        dismissible={!pending}
        initialFocusRef={pending ? undefined : cancelControlRef}
        onClose={closeFromShell}
        role={role}
        title={title}
        visible={visible}
      >
        <ConfirmationContent
          cancelControlRef={cancelControlRef}
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
            interactiveSupporting ? (
              <Pressable
                aria-checked={supportingChecked}
                accessibilityLabel="관련 링크도 삭제"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: supportingChecked }}
                onPress={() => setSupportingChecked((checked) => !checked)}
              >
                <Text style={[styles.supporting, { color: theme.foregroundSecondary }]}>
                  관련 링크도 삭제
                </Text>
              </Pressable>
            ) : supportingText ? (
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
    message: '이 작업을 계속할까요?',
    onCancel: fn(),
    onConfirm: fn(),
    onDismiss: fn(),
    role: 'dialog',
    state: 'idle',
    supportingText: '',
    title: '작업 확인',
    tone: 'primary',
  },
  argTypes: {
    state: { control: 'inline-radio', options: ['idle', 'pending'] },
    tone: { control: 'inline-radio', options: ['primary', 'danger'] },
  },
  component: ConfirmationContentCatalog,
  excludeStories: ['DismissAndFocusContract', 'InteractiveSupportingContract'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Confirmation Content',
} satisfies Meta<typeof ConfirmationContentCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;
const openConfirmation: Story['play'] = async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: '확인 열기' }));
};

export const Base: Story = { play: openConfirmation };

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: [
        'tone',
        'state',
        'title',
        'message',
        'supportingText',
        'cancelLabel',
        'confirmLabel',
      ],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    args.onCancel.mockClear();
    args.onConfirm.mockClear();
    args.onDismiss.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '확인 열기' });

    await step('확인 surface 열기와 단일 role 확인', async () => {
      await userEvent.click(trigger);
      const surface = await screen.findByRole(args.role, { name: args.title });
      expect(surface).toBeVisible();
      expect(screen.getAllByRole(args.role)).toHaveLength(1);
      const initialFocusTarget =
        args.state === 'pending'
          ? surface
          : within(surface).getByRole('button', { name: args.cancelLabel });
      await waitFor(() => expect(initialFocusTarget).toHaveFocus());
    });

    if (args.state === 'pending') {
      await step('Pending 중 action과 dismiss 차단', async () => {
        const surface = screen.getByRole(args.role, { name: args.title });
        const confirm = within(surface).getByRole('button', { name: args.confirmLabel });
        const cancel = within(surface).getByRole('button', { name: args.cancelLabel });
        expect(cancel).toHaveAttribute('aria-disabled', 'true');
        expect(confirm).toHaveAttribute('aria-disabled', 'true');
        expect(confirm).toHaveAttribute('aria-busy', 'true');
        expect(within(surface).queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
        await userEvent.keyboard('{Escape}');
        const backdrop = screen.getByTestId('modal-sheet-backdrop');
        expect(getComputedStyle(backdrop).pointerEvents).toBe('none');
        expect(surface).toBeVisible();
        expect(args.onDismiss).not.toHaveBeenCalled();
      });
      return;
    }

    await step('닫기 dismiss와 trigger focus 복귀', async () => {
      const surface = screen.getByRole(args.role, { name: args.title });
      await userEvent.click(within(surface).getByRole('button', { name: '닫기' }));
      expect(args.onDismiss).toHaveBeenCalledWith();
      await waitFor(() => expect(trigger).toHaveFocus());
      await userEvent.click(trigger);
      await screen.findByRole(args.role, { name: args.title });
    });

    await step('확인과 취소 callback 확인', async () => {
      await userEvent.click(screen.getByRole('button', { name: args.confirmLabel }));
      expect(args.onConfirm).toHaveBeenCalledWith();
      await userEvent.click(screen.getByRole('button', { name: args.cancelLabel }));
      expect(args.onCancel).toHaveBeenCalledWith();
      await waitFor(() => expect(trigger).toHaveFocus());
    });
  },
};

export const Danger: Story = {
  args: {
    confirmLabel: '삭제',
    message: '삭제한 내용은 복구할 수 없습니다.',
    role: 'alertdialog',
    title: '삭제할까요?',
    tone: 'danger',
  },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: openConfirmation,
};

export const Pending: Story = {
  args: { ...Danger.args, state: 'pending' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
  play: Playground.play,
};

export const WithSupportingContent: Story = {
  args: { supportingText: '관련된 공유 링크도 더 이상 사용할 수 없습니다.' },
  play: openConfirmation,
};

export const Dark: Story = {
  args: Danger.args,
  globals: {
    backgrounds: { value: 'kosmoDark' },
    theme: 'dark',
    viewport: { isRotated: false, value: 'kosmoProfileFull' },
  },
  play: openConfirmation,
};

export const DismissAndFocusContract: Story = {
  args: Danger.args,
  globals: { reduceMotion: true },
  play: async ({ args, canvasElement, step }) => {
    args.onDismiss.mockClear();
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '확인 열기' });
    const initialBodyOverflow = document.body.style.overflow;
    const open = async () => {
      await userEvent.click(trigger);
      return screen.findByRole('alertdialog', { name: args.title });
    };

    await step('초기 focus와 순환', async () => {
      const surface = await open();
      const close = within(surface).getByRole('button', { name: '닫기' });
      const cancel = within(surface).getByRole('button', { name: args.cancelLabel });
      const confirm = within(surface).getByRole('button', { name: args.confirmLabel });
      expect(surface).toHaveAttribute('aria-modal', 'true');
      expect(document.body.style.overflow).toBe('hidden');
      await waitFor(() => expect(cancel).toHaveFocus());
      await userEvent.tab({ shift: true });
      expect(close).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(confirm).toHaveFocus();
      await userEvent.tab();
      expect(close).toHaveFocus();
    });

    await step('Escape dismiss와 trigger focus 복귀', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(document.body.style.overflow).toBe(initialBodyOverflow);
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

export const InteractiveSupportingContract: Story = {
  args: { ...Danger.args, interactiveSupporting: true, state: 'pending' },
  globals: { reduceMotion: true },
  play: async ({ args, canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('Pending 중 interactive supporting content의 focus 순환', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '확인 열기' }));
      const surface = await screen.findByRole('alertdialog', { name: args.title });
      const supportingControl = within(surface).getByRole('checkbox', {
        name: '관련 링크도 삭제',
      });
      await waitFor(() => expect(supportingControl).toHaveFocus());
      await userEvent.tab();
      expect(supportingControl).toHaveFocus();
      await userEvent.tab({ shift: true });
      expect(supportingControl).toHaveFocus();
    });
  },
};

const styles = StyleSheet.create({
  fixture: { alignItems: 'flex-start', padding: space[16] },
  supporting: textStyles.uiCopyM,
});
