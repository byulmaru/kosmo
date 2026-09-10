import { ContentReportTargetType } from '@kosmo/core/enums';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ContentReportOverlay } from '@/components/content-report/ContentReportOverlay';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ContentReportPreview() {
  const [visible, setVisible] = useState(true);

  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)}>
        <Text>신고 UI 열기</Text>
      </Pressable>
      <ContentReportOverlay
        onRequestClose={() => setVisible(false)}
        target={{
          id: 'post-local-preview',
          kind: ContentReportTargetType.POST,
          label: '@minji의 게시물',
        }}
        visible={visible}
      />
    </View>
  );
}

const meta = {
  parameters: {
    a11y: {
      config: {
        rules: [
          { enabled: false, id: 'aria-allowed-attr' },
          { enabled: false, id: 'color-contrast' },
        ],
      },
    },
    layout: 'fullscreen',
    relay: { mutationResponse: { submitContentReport: { status: 'DELIVERED' } } },
  },
  title: 'KOSMO/Screens/Content Report',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PostReport: Story = {
  render: () => <ContentReportPreview />,
};

export const SubmissionSuccess: Story = {
  render: () => <ContentReportPreview />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(page.getByRole('button', { name: '신고하기' }));

    await waitFor(() => {
      expect(page.queryByRole('button', { name: '게시물 신고 닫기' })).not.toBeInTheDocument();
    });
    expect(page.getByRole('alert')).toHaveTextContent('신고를 전달했습니다.');
  },
};

export const PostReportLayoutContract: Story = {
  globals: { viewport: { isRotated: false, value: 'contentReportShort' } },
  parameters: {
    viewport: {
      options: {
        contentReportShort: {
          name: 'Content report short',
          styles: { height: '821px', width: '600px' },
          type: 'desktop',
        },
      },
    },
  },
  render: () => <ContentReportPreview />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const close = page.getByRole('button', { name: '게시물 신고 닫기' });
    const body = page.getByTestId('content-report-overlay-body');
    const submit = page.getByRole('button', { name: '신고하기' });

    expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
    await waitFor(() => expect(close).toHaveFocus());
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await waitFor(() => expect(submit).toHaveFocus());

    const bodyBounds = body.getBoundingClientRect();
    const submitBounds = submit.getBoundingClientRect();
    expect(submitBounds.bottom).toBeLessThanOrEqual(bodyBounds.bottom);
  },
};
