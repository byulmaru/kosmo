import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { FeedbackOverlay } from '@/components/feedback/FeedbackOverlay';
import { FeedbackPage } from '@/components/feedback/FeedbackPage';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FeedbackFormState } from '@/components/feedback/FeedbackForm';

function FeedbackFormStateProbe() {
  const [state, setState] = useState<FeedbackFormState>({ dirty: false, submitting: false });

  return (
    <View>
      <FeedbackForm onStateChange={setState} />
      <Text accessibilityLabel="피드백 폼 상태">
        {state.dirty ? 'dirty' : 'clean'} {state.submitting ? 'submitting' : 'idle'}
      </Text>
    </View>
  );
}

function FeedbackOverlayFixture({ initiallyVisible = false }: { initiallyVisible?: boolean }) {
  const [visible, setVisible] = useState(initiallyVisible);

  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)}>
        <Text>피드백 오버레이 열기</Text>
      </Pressable>
      <FeedbackOverlay onRequestClose={() => setVisible(false)} visible={visible} />
    </View>
  );
}

const meta = {
  component: FeedbackPage,
  parameters: {
    layout: 'fullscreen',
    router: { pathname: '/feedback' },
  },
  title: 'KOSMO/Screens/Feedback',
} satisfies Meta<typeof FeedbackPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getAllByRole('heading', { name: '피드백 보내기' })).toHaveLength(1);
    expect(canvas.getByRole('button', { name: '피드백 보내기' })).toBeDisabled();
  },
};

export const CompactIdle: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  render: () => <FeedbackPage />,
};

export const FullIdle: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  render: () => <FeedbackPage />,
};

export const BugReport: Story = {
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bugReport = canvas.getByRole('radio', { name: '버그를 발견했어요' });
    await userEvent.click(bugReport);
    expect(bugReport).toBeChecked();
    expect(bugReport).toHaveStyle({ borderRadius: '12px' });
    expect(canvas.getAllByRole('textbox')).toHaveLength(1);
  },
};

export const KeyboardNavigation: Story = {
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const radios = canvas.getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(radios[0]).toHaveAttribute('tabindex', '0');
    radios.slice(1).forEach((radio) => expect(radio).toHaveAttribute('tabindex', '-1'));

    await userEvent.tab();
    expect(radios[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');
    expect(radios[2]).toHaveFocus();
    expect(radios[2]).toBeChecked();
    await userEvent.keyboard('{ArrowLeft}');
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toBeChecked();
    await userEvent.keyboard('{ArrowUp}');
    expect(radios[0]).toHaveFocus();
    expect(radios[0]).toBeChecked();
  },
};

export const TrimmedBodyBoundary: Story = {
  parameters: {
    relay: { mutationResponse: { submitFeedback: { completed: true } } },
  },
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '피드백 내용' });
    const boundaryBody = ` ${'가'.repeat(2000)} `;
    fireEvent.change(body, { target: { value: boundaryBody } });
    expect(body).toHaveValue(boundaryBody);
    await userEvent.click(canvas.getByRole('button', { name: '피드백 보내기' }));
    await expect(canvas.getByText('피드백을 전달했습니다. 감사합니다!')).toBeVisible();
  },
};

export const BodyTooLong: Story = {
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '피드백 내용' });
    fireEvent.change(body, { target: { value: '가'.repeat(2001) } });
    await expect(canvas.getByText('피드백은 2,000자 이내로 입력해주세요.')).toBeVisible();
    expect(body).toHaveAttribute('aria-invalid', 'true');
    expect(canvas.getByRole('button', { name: '피드백 보내기' })).toBeDisabled();
  },
};

export const Pending: Story = {
  parameters: { relay: { mutationLoading: true } },
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bugReport = canvas.getByRole('radio', { name: '버그를 발견했어요' });
    await userEvent.click(bugReport);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '피드백 내용' }),
      '전달 중인 피드백입니다.',
    );
    const submit = canvas.getByRole('button', { name: '피드백 보내기' });
    await userEvent.click(submit);
    await expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(bugReport).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(canvas.getByRole('radio', { name: '좋아요' }));
    expect(bugReport).toBeChecked();
  },
};

export const StateSignal: Story = {
  parameters: { relay: { mutationLoading: true } },
  render: () => <FeedbackFormStateProbe />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const state = canvas.getByLabelText('피드백 폼 상태');
    expect(state).toHaveTextContent('clean idle');

    await userEvent.type(
      canvas.getByRole('textbox', { name: '피드백 내용' }),
      '상태를 외부에서 관찰합니다.',
    );
    await expect(state).toHaveTextContent('dirty idle');

    await userEvent.click(canvas.getByRole('button', { name: '피드백 보내기' }));
    await expect(state).toHaveTextContent('dirty submitting');
  },
};

export const OverlayFocusLifecycle: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  render: () => <FeedbackOverlayFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ownerDocument = canvasElement.ownerDocument;
    const page = within(ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '피드백 오버레이 열기' });
    const previousOverflow = ownerDocument.body.style.overflow;

    await userEvent.click(trigger);
    const dialog = await page.findByRole('dialog', { name: '피드백 보내기' });
    const close = within(dialog).getByRole('button', { name: '피드백 닫기' });
    await waitFor(() => expect(close).toHaveFocus());
    const closeBounds = close.getBoundingClientRect();
    expect(closeBounds.width).toBe(36);
    expect(closeBounds.height).toBe(36);
    expect(ownerDocument.body.style.overflow).toBe('hidden');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    await waitFor(() =>
      expect(within(dialog).getByRole('textbox', { name: '피드백 내용' })).toHaveFocus(),
    );
    await userEvent.keyboard('{Tab}');
    await waitFor(() => expect(close).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog', { name: '피드백 보내기' })).toBeNull());
    expect(ownerDocument.body.style.overflow).toBe(previousOverflow);
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const OverlayMobileSheetGeometry: Story = {
  globals: { viewport: { isRotated: false, value: 'feedbackMobileShort' } },
  parameters: {
    viewport: {
      options: {
        feedbackMobileShort: {
          name: 'Feedback mobile short',
          styles: { height: '568px', width: '390px' },
          type: 'mobile',
        },
      },
    },
  },
  render: () => <FeedbackOverlayFixture initiallyVisible />,
  play: async ({ canvasElement }) => {
    const ownerDocument = canvasElement.ownerDocument;
    const view = ownerDocument.defaultView;
    const page = within(ownerDocument.body);
    await page.findByRole('dialog', { name: '피드백 보내기' });
    const surface = page.getByTestId('feedback-overlay-surface');
    const body = page.getByTestId('feedback-overlay-body');
    const bounds = surface.getBoundingClientRect();

    expect(bounds.width).toBeCloseTo(view?.innerWidth ?? 0, 0);
    expect(bounds.bottom).toBeCloseTo(view?.innerHeight ?? 0, 0);
    expect(bounds.height).toBeLessThanOrEqual((view?.innerHeight ?? 0) * 0.85 + 1);
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  },
};

export const OverlayFullDialogGeometry: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  render: () => <FeedbackOverlayFixture initiallyVisible />,
  play: async ({ canvasElement }) => {
    const ownerDocument = canvasElement.ownerDocument;
    const view = ownerDocument.defaultView;
    const page = within(ownerDocument.body);
    await page.findByRole('dialog', { name: '피드백 보내기' });
    const bounds = page.getByTestId('feedback-overlay-surface').getBoundingClientRect();

    expect(bounds.width).toBe(600);
    expect(bounds.height).toBeLessThanOrEqual((view?.innerHeight ?? 0) * 0.85 + 1);
    expect(bounds.left + bounds.width / 2).toBeCloseTo((view?.innerWidth ?? 0) / 2, 0);
  },
};

export const OverlayDirtyCloseGuard: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  render: () => <FeedbackOverlayFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '피드백 오버레이 열기' });

    await userEvent.click(trigger);
    const dialog = await page.findByRole('dialog', { name: '피드백 보내기' });
    const body = within(dialog).getByRole('textbox', { name: '피드백 내용' });
    await userEvent.type(body, '작성 중인 피드백');
    await userEvent.click(within(dialog).getByRole('button', { name: '피드백 닫기' }));

    const confirm = await page.findByRole('alertdialog', {
      name: '작성 중인 피드백을 버릴까요?',
    });
    expect(body).toHaveValue('작성 중인 피드백');
    const continueButton = within(confirm).getByRole('button', { name: '계속 작성' });
    const discardButton = within(confirm).getByRole('button', { name: '피드백 버리기' });
    await waitFor(() => expect(continueButton).toHaveFocus());
    await userEvent.tab();
    expect(discardButton).toHaveFocus();
    await userEvent.tab();
    expect(continueButton).toHaveFocus();
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(discardButton).toHaveFocus();
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(continueButton).toHaveFocus();
    await userEvent.click(continueButton);
    expect(page.queryByRole('alertdialog', { name: '작성 중인 피드백을 버릴까요?' })).toBeNull();
    expect(body).toHaveValue('작성 중인 피드백');
    await waitFor(() => expect(body).toHaveFocus());

    await userEvent.click(within(dialog).getByRole('button', { name: '피드백 닫기' }));
    await userEvent.click(
      within(
        await page.findByRole('alertdialog', { name: '작성 중인 피드백을 버릴까요?' }),
      ).getByRole('button', { name: '피드백 버리기' }),
    );
    await waitFor(() => expect(page.queryByRole('dialog', { name: '피드백 보내기' })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const OverlaySubmittingCloseGuard: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: { relay: { mutationLoading: true } },
  render: () => <FeedbackOverlayFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '피드백 오버레이 열기' }));
    const dialog = await page.findByRole('dialog', { name: '피드백 보내기' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: '피드백 내용' }),
      '전달 중인 피드백',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: '피드백 보내기' }));
    const close = within(dialog).getByRole('button', { name: '피드백 닫기' });
    await waitFor(() => expect(close).toBeDisabled());

    await userEvent.keyboard('{Escape}');
    expect(page.getByRole('dialog', { name: '피드백 보내기' })).toBeVisible();
    expect(page.queryByRole('alertdialog', { name: '작성 중인 피드백을 버릴까요?' })).toBeNull();

    const surface = page.getByTestId('feedback-overlay-surface');
    fireEvent.click(surface.parentElement!);
    expect(page.getByRole('dialog', { name: '피드백 보내기' })).toBeVisible();
  },
};

export const OverlaySuccessStaysOpenForNextFeedback: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: {
    relay: { mutationResponse: { submitFeedback: { completed: true } } },
  },
  render: () => <FeedbackOverlayFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '피드백 오버레이 열기' }));
    const dialog = await page.findByRole('dialog', { name: '피드백 보내기' });
    const body = within(dialog).getByRole('textbox', { name: '피드백 내용' });
    await userEvent.type(body, '첫 번째 피드백');
    await userEvent.click(within(dialog).getByRole('button', { name: '피드백 보내기' }));
    await expect(
      within(dialog).findByText('피드백을 전달했습니다. 감사합니다!'),
    ).resolves.toBeVisible();
    expect(body).toHaveValue('');
    expect(within(dialog).getByRole('radio', { name: '좋아요' })).toBeChecked();

    await userEvent.type(body, '두 번째 피드백');
    expect(within(dialog).getByRole('button', { name: '피드백 보내기' })).toBeEnabled();
  },
};

export const Success: Story = {
  parameters: {
    relay: { mutationResponse: { submitFeedback: { completed: true } } },
  },
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '피드백 내용' });
    await userEvent.click(canvas.getByRole('radio', { name: '버그를 발견했어요' }));
    await userEvent.type(body, '버그를 고쳐주세요.');
    await userEvent.click(canvas.getByRole('button', { name: '피드백 보내기' }));
    await expect(canvas.getByText('피드백을 전달했습니다. 감사합니다!')).toBeVisible();
    expect(canvas.getByRole('radio', { name: '좋아요' })).toBeChecked();
    expect(body).toHaveValue('');
  },
};

export const DeliveryFailureKeepsInput: Story = {
  parameters: { relay: { mutationError: 'Slack delivery failed' } },
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const message = '다시 시도할 수 있어야 해요.';
    const body = canvas.getByRole('textbox', { name: '피드백 내용' });
    await userEvent.type(body, message);
    await userEvent.click(canvas.getByRole('button', { name: '피드백 보내기' }));
    await expect(
      canvas.getByText('피드백을 전달하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.'),
    ).toBeVisible();
    expect(canvas.getByRole('button', { name: '피드백 다시 시도' })).toBeVisible();
    await expect(body).toHaveValue(message);
  },
};
