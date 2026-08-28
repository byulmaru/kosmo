import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ToastProvider, useToast } from '@/components/ui/ToastProvider';
import { spacing } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ToastFixture() {
  const { showToast } = useToast();

  return (
    <View style={styles.fixture}>
      <Pressable
        accessibilityLabel="생성 실패 표시"
        accessibilityRole="button"
        onPress={() =>
          showToast('재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.', {
            tone: 'danger',
          })
        }
        style={styles.button}
      >
        <Text>생성 실패 표시</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="취소 실패 표시"
        accessibilityRole="button"
        onPress={() =>
          showToast('재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.', {
            tone: 'danger',
          })
        }
        style={styles.button}
      >
        <Text>취소 실패 표시</Text>
      </Pressable>
    </View>
  );
}

const scopedRetry = fn().mockName('scopedRetry');

function ScopedToastFixture() {
  const { showToast } = useToast();
  const cleanup = useRef<() => void>(() => undefined);

  return (
    <View style={styles.fixture}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          cleanup.current = showToast('이전 목록 오류', {
            action: { label: '다시 시도', onPress: scopedRetry },
            tone: 'danger',
          });
        }}
      >
        <Text>목록 오류 표시</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => showToast('최신 알림', { tone: 'info' })}
      >
        <Text>최신 알림 표시</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => cleanup.current()}>
        <Text>이전 목록 정리</Text>
      </Pressable>
    </View>
  );
}

const toneSamples = [
  { label: '정보', message: '정보 알림', tone: 'info' as const },
  { label: '성공', message: '성공 알림', tone: 'success' as const },
  { label: '경고', message: '경고 알림', tone: 'warning' as const },
  { label: '위험', message: '위험 알림', tone: 'danger' as const },
] as const;

function ToneAndActionToastFixture() {
  const { showToast } = useToast();

  return (
    <View style={styles.fixture}>
      <Text>버튼을 눌러 현재 테마의 Toast 색상과 action target을 확인하세요.</Text>
      {toneSamples.map((sample) => (
        <View key={sample.tone} style={styles.row}>
          {([false, true] as const).map((action) => (
            <Pressable
              accessibilityRole="button"
              key={`${sample.tone}-${action}`}
              onPress={() =>
                showToast(
                  sample.message,
                  action
                    ? {
                        action: { label: '다시 시도', onPress: () => undefined },
                        tone: sample.tone,
                      }
                    : { tone: sample.tone },
                )
              }
              style={styles.button}
            >
              <Text>{`${sample.label} · 액션 ${action ? '있음' : '없음'}`}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

function ToastPlayground({
  action,
  actionLabel,
  message,
  onAction,
  tone,
}: {
  action: boolean;
  actionLabel: string;
  message: string;
  onAction: () => void;
  tone: 'danger' | 'info' | 'success' | 'warning';
}) {
  return (
    <ToastProvider>
      <ToastPlaygroundTrigger
        action={action}
        actionLabel={actionLabel}
        message={message}
        onAction={onAction}
        tone={tone}
      />
    </ToastProvider>
  );
}

function ToastPlaygroundTrigger({
  action,
  actionLabel,
  message,
  onAction,
  tone,
}: Parameters<typeof ToastPlayground>[0]) {
  const { showToast } = useToast();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        showToast(message, {
          ...(action ? { action: { label: actionLabel, onPress: onAction } } : {}),
          tone,
        })
      }
      style={styles.button}
    >
      <Text>Toast 표시</Text>
    </Pressable>
  );
}

const meta = {
  args: {
    action: true,
    actionLabel: '다시 시도',
    message: '요청을 완료하지 못했습니다.',
    onAction: fn(),
    tone: 'danger',
  },
  argTypes: {
    tone: { control: 'select', options: ['info', 'success', 'warning', 'danger'] },
  },
  component: ToastPlayground,
  excludeStories: [
    'ReplacementAndAutoDismiss',
    'RepeatedMessageRestartsAutoDismiss',
    'ScopedCleanupDoesNotDismissNewerToast',
  ],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Toast Provider',
} satisfies Meta<typeof ToastPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

const repeatedToastMessage = '재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.';
const toastDurationMs = 3000;

export const Default: Story = {};

export const Playground: Story = {
  parameters: {
    controls: { disable: false, include: ['action', 'actionLabel', 'message', 'tone'] },
  },
  play: async ({ args, canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step('Toast 표시와 메시지 확인', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Toast 표시' }));
      expect(await canvas.findByRole('alert')).toHaveTextContent(args.message);
    });
    if (args.action) {
      await step('Toast action 실행과 callback 확인', async () => {
        await userEvent.click(canvas.getByRole('button', { name: args.actionLabel }));
        expect(args.onAction).toHaveBeenCalledOnce();
      });
    }
  },
};

export const ReplacementAndAutoDismiss: Story = {
  render: () => (
    <ToastProvider>
      <ToastFixture />
    </ToastProvider>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('위험 Toast 표시와 스타일 확인', async () => {
      expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
      await userEvent.click(canvas.getByRole('button', { name: '생성 실패 표시' }));
      const alert = await canvas.findByRole('alert');
      const toastMessage = within(alert).getByText(
        '재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
      const toastSurface = toastMessage.parentElement!;
      expect(alert).toHaveTextContent('재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      expect(getComputedStyle(toastSurface).backgroundColor).toBe('rgb(254, 228, 226)');
      expect(
        toastMessage.getBoundingClientRect().top - toastSurface.getBoundingClientRect().top,
      ).toBeCloseTo(12, 0);
    });

    await step('새 Toast로 교체', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '취소 실패 표시' }));
      expect(canvas.getByRole('alert')).toHaveTextContent(
        '재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
      expect(canvas.getAllByRole('alert')).toHaveLength(1);
    });

    await step('Toast 자동 닫힘 확인', async () => {
      await waitFor(() => expect(canvas.queryByRole('alert')).not.toBeInTheDocument(), {
        timeout: 3500,
      });
    });
  },
};

export const RepeatedMessageRestartsAutoDismiss: Story = {
  render: () => (
    <ToastProvider>
      <ToastFixture />
    </ToastProvider>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '생성 실패 표시' });
    let firstAlert: HTMLElement;
    let firstShownAt = 0;
    let secondAlert: HTMLElement;
    let secondShownAt = 0;

    await step('첫 Toast 표시', async () => {
      await userEvent.click(trigger);
      firstAlert = await canvas.findByRole('alert');
      firstShownAt = Date.now();
      expect(firstAlert).toHaveTextContent(repeatedToastMessage);
    });

    await step('반복 표시 시 Toast 교체', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(canvas.getByRole('alert')).toBe(firstAlert);
      await userEvent.click(trigger);
      secondAlert = await canvas.findByRole('alert');
      secondShownAt = Date.now();
      expect(secondAlert).toHaveTextContent(repeatedToastMessage);
      expect(secondAlert).not.toBe(firstAlert);
      expect(canvas.getAllByRole('alert')).toHaveLength(1);
    });

    await step('교체된 Toast 자동 닫힘 확인', async () => {
      await waitFor(
        () => {
          expect(Date.now()).toBeGreaterThanOrEqual(firstShownAt + toastDurationMs);
          expect(canvas.getByRole('alert')).toBe(secondAlert);
        },
        { interval: 50, timeout: 2500 },
      );
      await waitFor(() => expect(canvas.queryByRole('alert')).not.toBeInTheDocument(), {
        interval: 50,
        timeout: 1500,
      });
      expect(Date.now() - secondShownAt).toBeGreaterThanOrEqual(toastDurationMs - 100);
    });
  },
};

export const ScopedCleanupDoesNotDismissNewerToast: Story = {
  render: () => (
    <ToastProvider>
      <ScopedToastFixture />
    </ToastProvider>
  ),
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    scopedRetry.mockClear();

    await step('이전 목록 오류 Toast 정리', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '목록 오류 표시' }));
      await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('이전 목록 오류');
      await userEvent.click(canvas.getByRole('button', { name: '이전 목록 정리' }));
      expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    });

    await step('새 Toast 보존과 이전 action 미호출 확인', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '목록 오류 표시' }));
      await userEvent.click(canvas.getByRole('button', { name: '최신 알림 표시' }));
      expect(canvas.getByRole('alert')).toHaveTextContent('최신 알림');
      await userEvent.click(canvas.getByRole('button', { name: '이전 목록 정리' }));
      expect(canvas.getByRole('alert')).toHaveTextContent('최신 알림');
      expect(scopedRetry).not.toHaveBeenCalled();
    });
  },
};

export const ToneAndActionMatrix: Story = {
  render: () => (
    <ToastProvider>
      <ToneAndActionToastFixture />
    </ToastProvider>
  ),
};

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', minHeight: 44, padding: spacing.md },
  fixture: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
