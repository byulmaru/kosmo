import { expect, userEvent, within } from 'storybook/test';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: FeedbackForm,
  parameters: {
    router: { pathname: '/menu' },
  },
  title: 'KOSMO/Feedback/Form',
} satisfies Meta<typeof FeedbackForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  render: () => (
    <Catalog width={760}>
      <Section title="피드백 · 기본">
        <FeedbackForm />
      </Section>
    </Catalog>
  ),
};

export const BugReportWithSentryEvent: Story = {
  render: () => (
    <Catalog width={760}>
      <Section title="피드백 · 버그 리포트">
        <FeedbackForm />
      </Section>
    </Catalog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: '버그를 발견했어요' }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Sentry 이벤트 ID (선택)' }),
      'A'.repeat(32),
    );
    expect(canvas.getByRole('textbox', { name: 'Sentry 이벤트 ID (선택)' })).toHaveValue(
      'A'.repeat(32),
    );
  },
};

export const Validation: Story = {
  render: () => (
    <Catalog width={760}>
      <Section title="피드백 · 입력 검증">
        <FeedbackForm />
      </Section>
    </Catalog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: '버그를 발견했어요' }));
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Sentry 이벤트 ID (선택)' }),
      'invalid-event-id',
    );
    await expect(canvas.getByText('Sentry 이벤트 ID는 32자리 16진수여야 합니다.')).toBeVisible();
    expect(canvas.getByRole('button', { name: '피드백 보내기' })).toBeDisabled();
  },
};

export const TrimmedBodyBoundary: Story = {
  parameters: {
    relay: { mutationResponse: { submitFeedback: { completed: true } } },
  },
  render: () => (
    <Catalog width={760}>
      <Section title="피드백 · trim 경계">
        <FeedbackForm />
      </Section>
    </Catalog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '피드백 내용' });
    const boundaryBody = ` ${'가'.repeat(2000)} `;
    await userEvent.type(body, boundaryBody);
    expect(body).toHaveValue(boundaryBody);
    await userEvent.click(canvas.getByRole('button', { name: '피드백 보내기' }));
    await expect(canvas.getByText('피드백을 전달했습니다. 감사합니다!')).toBeVisible();
  },
};

export const BodyTooLong: Story = {
  render: () => (
    <Catalog width={760}>
      <Section title="피드백 · 본문 길이 검증">
        <FeedbackForm />
      </Section>
    </Catalog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '피드백 내용' });
    await userEvent.type(body, '가'.repeat(2001));
    await expect(canvas.getByText('피드백은 2,000자 이내로 입력해주세요.')).toBeVisible();
    expect(body).toHaveAttribute('aria-invalid', 'true');
    expect(canvas.getByRole('button', { name: '피드백 보내기' })).toBeDisabled();
  },
};

export const Pending: Story = {
  parameters: { relay: { mutationLoading: true } },
  render: () => (
    <Catalog width={760}>
      <Section title="피드백 · 전달 중">
        <FeedbackForm />
      </Section>
    </Catalog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '피드백 내용' }),
      '전달 중인 피드백입니다.',
    );
    const submit = canvas.getByRole('button', { name: '피드백 보내기' });
    await userEvent.click(submit);
    await expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
  },
};

export const Success: Story = {
  parameters: {
    relay: { mutationResponse: { submitFeedback: { completed: true } } },
  },
  render: () => (
    <Catalog width={760}>
      <Section title="피드백 · 성공">
        <FeedbackForm />
      </Section>
    </Catalog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: '피드백 내용' }), '사용하기 편해요.');
    await userEvent.click(canvas.getByRole('button', { name: '피드백 보내기' }));
    await expect(canvas.getByText('피드백을 전달했습니다. 감사합니다!')).toBeVisible();
  },
};

export const DeliveryFailureKeepsInput: Story = {
  parameters: { relay: { mutationError: 'Slack delivery failed' } },
  render: () => (
    <Catalog width={760}>
      <Section title="피드백 · 재시도">
        <FeedbackForm />
      </Section>
    </Catalog>
  ),
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
