import { expect, fn, userEvent, within } from 'storybook/test';
import { FeedbackOverlay } from '@/components/feedback/FeedbackOverlay';
import { FeedbackPage } from '@/components/feedback/FeedbackPage';
import {
  resetImagePickerMock,
  setNextImagePickerResult,
} from '../../../.storybook/mocks/expo-image-picker';
import ogImage from '../../../public/og-default.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: FeedbackPage,
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    router: { pathname: '/feedback' },
  },
  title: 'KOSMO/Screens/Feedback/Tests',
} satisfies Meta<typeof FeedbackPage>;
export default meta;
type Story = StoryObj<typeof meta>;

let feedbackAttachmentRequest: RequestInit | undefined;

export const SelectedImages: Story = {
  beforeEach: () => {
    resetImagePickerMock();
    setNextImagePickerResult({
      assets: [1, 2, 3].map((index) => ({
        fileName: `feedback-${index}.png`,
        fileSize: 1024,
        height: 630,
        mimeType: 'image/png',
        uri: ogImage,
        width: 1200,
      })),
      canceled: false,
    });
    return resetImagePickerMock;
  },
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '이미지 추가' }));
    const preview = await canvas.findByLabelText('첨부 이미지 1, 선택됨');
    expect(preview.getBoundingClientRect().width).toBe(112);
    expect(canvas.getAllByRole('button', { name: /^첨부 이미지 \d 제거$/u })).toHaveLength(3);
    expect(canvas.queryByRole('button', { name: /이미지.*편집/u })).toBeNull();
    expect(canvas.queryByLabelText(/업로드 완료/u)).toBeNull();
    expect(canvas.getByRole('button', { name: '이미지 추가' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '첨부 이미지 3 제거' }));
    expect(canvas.getAllByRole('button', { name: /^첨부 이미지 \d 제거$/u })).toHaveLength(2);
    setNextImagePickerResult({ assets: null, canceled: true });
    await userEvent.click(canvas.getByRole('button', { name: '이미지 추가' }));
    expect(canvas.getAllByRole('button', { name: /^첨부 이미지 \d 제거$/u })).toHaveLength(2);
    setNextImagePickerResult({
      assets: [{ fileSize: 1024, height: 630, mimeType: 'image/png', uri: ogImage, width: 1200 }],
      canceled: false,
    });
    await userEvent.click(canvas.getByRole('button', { name: '이미지 추가' }));
    expect(canvas.getAllByRole('button', { name: /^첨부 이미지 \d 제거$/u })).toHaveLength(3);
  },
};

export const SelectedImagesSubmission: Story = {
  beforeEach: () => {
    resetImagePickerMock();
    feedbackAttachmentRequest = undefined;
    setNextImagePickerResult({
      assets: [
        {
          file: new File(['feedback image'], 'feedback.png', { type: '' }),
          fileName: 'feedback.png',
          fileSize: 1024,
          height: 630,
          mimeType: '',
          uri: ogImage,
          width: 1200,
        },
      ],
      canceled: false,
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/feedback/attachments')) {
        feedbackAttachmentRequest = init;
        return new Response(JSON.stringify({ completed: true }), { status: 200 });
      }
      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
      resetImagePickerMock();
    };
  },
  render: () => <FeedbackPage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: '피드백 내용' }),
      '이미지 첨부 피드백',
    );
    await userEvent.click(canvas.getByRole('button', { name: '이미지 추가' }));
    await expect(canvas.findByLabelText('첨부 이미지 1, 선택됨')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '피드백 보내기' }));
    await expect(canvas.findByText('피드백을 전달했습니다. 감사합니다!')).resolves.toBeVisible();

    expect(feedbackAttachmentRequest?.credentials).toBe('include');
    const formData = feedbackAttachmentRequest?.body as FormData;
    expect(formData.get('body')).toBe('이미지 첨부 피드백');
    expect(formData.get('kind')).toBe('POSITIVE');
    expect(formData.getAll('attachments')).toHaveLength(1);
  },
};

export const OverlaySelectedImages: Story = {
  globals: { viewport: { isRotated: false, value: 'feedbackDesktopShort' } },
  parameters: {
    viewport: {
      options: {
        feedbackDesktopShort: {
          name: 'Feedback desktop short',
          styles: { height: '800px', width: '1000px' },
          type: 'desktop',
        },
      },
    },
  },
  beforeEach: SelectedImages.beforeEach,
  render: () => <FeedbackOverlay onRequestClose={fn()} visible />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(await page.findByRole('dialog', { name: '피드백 보내기' }));
    const surface = page.getByTestId('feedback-overlay-surface');
    const before = surface.getBoundingClientRect();
    expect(before.top).toBe(48);
    await userEvent.type(
      dialog.getByRole('textbox', { name: '피드백 내용' }),
      '이 화면에서 발견한 내용을 이미지와 함께 보내요.',
    );
    await userEvent.click(dialog.getByRole('button', { name: '이미지 추가' }));
    await expect(dialog.findByLabelText('첨부 이미지 3, 선택됨')).resolves.toBeVisible();
    const after = surface.getBoundingClientRect();
    expect(after.top).toBe(before.top);
    expect(after.height).toBeGreaterThan(before.height);
    expect(after.bottom).toBeLessThanOrEqual(752);
    const body = page.getByTestId('feedback-overlay-body');
    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  },
};
