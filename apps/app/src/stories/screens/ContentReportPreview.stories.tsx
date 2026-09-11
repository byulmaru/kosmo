import { ContentReportTargetType } from '@kosmo/core/enums';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  ContentReportProvider,
  useContentReportMenuItem,
} from '@/components/content-report/ContentReportContext';
import { ActionMenu } from '@/components/ui/ActionMenu';
import type { Meta, StoryObj } from '@storybook/react-vite';

const mutationRequestObserver = fn().mockName('ContentReport mutation');

function ContentReportTrigger({ onReportOpen }: { onReportOpen?: () => void }) {
  const reportItem = useContentReportMenuItem({
    id: 'post-local-preview',
    kind: ContentReportTargetType.POST,
    label: '@minji의 게시물',
  });
  const menuItem = {
    ...reportItem,
    onSelect: () => {
      reportItem.onSelect();
      onReportOpen?.();
    },
  };

  return (
    <ActionMenu
      accessibilityLabel="콘텐츠 신고 메뉴"
      items={[menuItem]}
      renderTrigger={({ expanded, onPress, ref }) => (
        <Pressable
          accessibilityLabel="신고 메뉴 열기"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onPress}
          ref={ref}
        >
          <Text>신고 UI 열기</Text>
        </Pressable>
      )}
      webPlacement="overlap-end"
    />
  );
}

function ContentReportPreview({ hideTriggerOnOpen = false }: { hideTriggerOnOpen?: boolean }) {
  const [triggerVisible, setTriggerVisible] = useState(true);

  return (
    <ContentReportProvider>
      <View style={{ flex: 1 }} testID="universal-shell-root" tabIndex={-1}>
        {triggerVisible ? (
          <ContentReportTrigger
            onReportOpen={() => {
              if (hideTriggerOnOpen) {
                requestAnimationFrame(() => setTriggerVisible(false));
              }
            }}
          />
        ) : null}
      </View>
    </ContentReportProvider>
  );
}

const meta = {
  beforeEach: () => {
    mutationRequestObserver.mockClear();
  },
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
    relay: {
      mutationRequestObserver,
      mutationResponse: { submitContentReport: { status: 'DELIVERED' } },
    },
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
  play: async ({ canvasElement, parameters }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    const trigger = canvas.getByRole('button', { name: '신고 메뉴 열기' });
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    await userEvent.click(page.getByRole('radio', { name: '스팸·사기' }));
    await userEvent.type(
      page.getByRole('textbox', { name: '게시물 신고 상세 내용' }),
      '스팸 신고 상세 내용',
    );
    await userEvent.click(page.getByRole('button', { name: '신고하기' }));

    await waitFor(() => expect(parameters.relay.mutationRequestObserver).toHaveBeenCalledOnce());
    expect(parameters.relay.mutationRequestObserver).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ContentReportFormSubmitContentReportMutation',
        operationKind: 'mutation',
      }),
      {
        input: {
          details: '스팸 신고 상세 내용',
          reason: 'SPAM_FRAUD',
          targetId: 'post-local-preview',
          targetType: 'POST',
        },
      },
    );

    await waitFor(() => {
      expect(page.queryByRole('button', { name: '게시물 신고 닫기' })).not.toBeInTheDocument();
    });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(page.getByRole('alert')).toHaveTextContent('신고를 전달했습니다.');

    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    expect(page.getByRole('textbox', { name: '게시물 신고 상세 내용' })).toHaveValue('');
    expect(page.getByRole('radio', { name: '유해하거나 부적절한 콘텐츠' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
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
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '신고 메뉴 열기' });
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));

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

export const SubmissionUnknownKeepsDraftForRetry: Story = {
  parameters: {
    relay: {
      mutationRequestObserver,
      mutationResponse: { submitContentReport: { status: 'UNKNOWN' } },
    },
  },
  render: () => <ContentReportPreview />,
  play: async ({ canvasElement, parameters }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const detail = '확인 전까지 유지할 신고 내용';

    await userEvent.click(canvas.getByRole('button', { name: '신고 메뉴 열기' }));
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    await userEvent.type(page.getByRole('textbox', { name: '게시물 신고 상세 내용' }), detail);
    await userEvent.click(page.getByRole('button', { name: '신고하기' }));

    await waitFor(() =>
      expect(page.getByRole('alert')).toHaveTextContent('전달 결과를 확인하지 못했습니다'),
    );
    expect(page.getByRole('textbox', { name: '게시물 신고 상세 내용' })).toHaveValue(detail);

    await userEvent.click(page.getByRole('button', { name: '신고 다시 시도' }));
    await waitFor(() => expect(parameters.relay.mutationRequestObserver).toHaveBeenCalledTimes(2));
  },
};

export const SubmissionRejectedKeepsDraft: Story = {
  parameters: {
    relay: {
      mutationRequestObserver,
      mutationResponse: { submitContentReport: { status: 'REJECTED' } },
    },
  },
  render: () => <ContentReportPreview />,
  play: async ({ canvasElement, parameters }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const details = '거부되어도 유지할 신고 내용';

    await userEvent.click(canvas.getByRole('button', { name: '신고 메뉴 열기' }));
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    const spam = page.getByRole('radio', { name: '스팸·사기' });
    await userEvent.click(spam);
    await userEvent.type(page.getByRole('textbox', { name: '게시물 신고 상세 내용' }), details);
    await userEvent.click(page.getByRole('button', { name: '신고하기' }));

    await expect(page.getByRole('alert')).toHaveTextContent(
      '신고를 전달하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.',
    );
    expect(page.getByRole('textbox', { name: '게시물 신고 상세 내용' })).toHaveValue(details);
    expect(spam).toHaveAttribute('aria-checked', 'true');
    expect(page.getByRole('button', { name: '신고 다시 시도' })).toBeEnabled();
    await waitFor(() => expect(parameters.relay.mutationRequestObserver).toHaveBeenCalledOnce());
  },
};

export const OverlayDirtyCloseCancelDiscardReopenReset: Story = {
  render: () => <ContentReportPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '신고 메뉴 열기' });
    const details = '계속 작성하거나 버릴 수 있는 신고 내용';

    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    let dialog = await page.findByRole('dialog', { name: '게시물 신고' });
    const body = within(dialog).getByRole('textbox', { name: '게시물 신고 상세 내용' });
    const spam = within(dialog).getByRole('radio', { name: '스팸·사기' });
    await userEvent.click(spam);
    await userEvent.type(body, details);
    await userEvent.click(within(dialog).getByRole('button', { name: '게시물 신고 닫기' }));

    const confirm = await page.findByRole('alertdialog', { name: '작성 중인 신고를 버릴까요?' });
    expect(body).toHaveValue(details);
    expect(spam).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(confirm).getByRole('button', { name: '계속 작성' }));
    expect(page.queryByRole('alertdialog', { name: '작성 중인 신고를 버릴까요?' })).toBeNull();
    expect(body).toHaveValue(details);

    await userEvent.click(within(dialog).getByRole('button', { name: '게시물 신고 닫기' }));
    await userEvent.click(
      within(
        await page.findByRole('alertdialog', { name: '작성 중인 신고를 버릴까요?' }),
      ).getByRole('button', { name: '신고 버리기' }),
    );
    await waitFor(() => expect(page.queryByRole('dialog', { name: '게시물 신고' })).toBeNull());

    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    dialog = await page.findByRole('dialog', { name: '게시물 신고' });
    expect(within(dialog).getByRole('textbox', { name: '게시물 신고 상세 내용' })).toHaveValue('');
    expect(
      within(dialog).getByRole('radio', { name: '유해하거나 부적절한 콘텐츠' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

export const OverlaySubmittingSuppressesDuplicateAndClose: Story = {
  parameters: { relay: { mutationLoading: true } },
  render: () => <ContentReportPreview />,
  play: async ({ canvasElement, parameters }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '신고 메뉴 열기' }));
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    const dialog = await page.findByRole('dialog', { name: '게시물 신고' });
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: '게시물 신고 상세 내용' }),
      '전달 중인 신고',
    );
    const submit = within(dialog).getByRole('button', { name: '신고하기' });
    await userEvent.click(submit);
    const close = within(dialog).getByRole('button', { name: '게시물 신고 닫기' });
    await waitFor(() => expect(close).toBeDisabled());
    await waitFor(() => expect(parameters.relay.mutationRequestObserver).toHaveBeenCalledOnce());

    fireEvent.click(submit);
    expect(parameters.relay.mutationRequestObserver).toHaveBeenCalledOnce();

    await userEvent.keyboard('{Escape}');
    expect(page.getByRole('dialog', { name: '게시물 신고' })).toBeVisible();
    expect(page.queryByRole('alertdialog', { name: '작성 중인 신고를 버릴까요?' })).toBeNull();

    const surface = page.getByTestId('content-report-overlay-surface');
    fireEvent.click(surface.parentElement!);
    expect(page.getByRole('dialog', { name: '게시물 신고' })).toBeVisible();
  },
};

export const FallbackFocusAfterTriggerRemoval: Story = {
  render: () => <ContentReportPreview hideTriggerOnOpen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '신고 메뉴 열기' });
    const fallback = canvas.getByTestId('universal-shell-root');

    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    await waitFor(() => expect(trigger).not.toBeInTheDocument());
    await userEvent.click(page.getByRole('button', { name: '게시물 신고 닫기' }));
    await waitFor(() => expect(fallback).toHaveFocus());
  },
};
