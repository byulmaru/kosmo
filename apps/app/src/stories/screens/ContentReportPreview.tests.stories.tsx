import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import baseMeta, {
  ContentReportPreview,
  longReportAuthor,
  reportAuthor,
} from './ContentReportPreview.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/Content Report/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

async function completeReport(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const page = within(canvasElement.ownerDocument.body);
  await waitFor(() => expect(canvas.getByRole('button', { name: '신고 메뉴 열기' })).toBeVisible());
  const trigger = canvas.getByRole('button', { name: '신고 메뉴 열기' });
  await userEvent.click(trigger);
  await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
  await userEvent.click(page.getByRole('button', { name: '신고하기' }));
  await waitFor(() => expect(page.getByText('신고가 접수되었어요')).toBeVisible());
  return { canvas, page };
}

function expectBlockSectionHidden(page: ReturnType<typeof within>) {
  expect(
    page.queryByRole('heading', { name: `${reportAuthor.relativeHandle} 차단` }),
  ).not.toBeInTheDocument();
  expect(page.queryByText('서로의 게시물이 숨겨지고 팔로우가 해제돼요.')).not.toBeInTheDocument();
}

export const SubmissionSuccess: Story = {
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

    expect(page.getByText('신고가 접수되었어요')).toBeVisible();
    expect(page.getByRole('button', { name: /차단하기/ })).toBeVisible();
    const complete = page.getByRole('button', { name: '완료' });
    await waitFor(() => expect(complete).toHaveFocus());
    await userEvent.click(complete);
    await waitFor(() => {
      expect(page.queryByRole('button', { name: '게시물 신고 닫기' })).not.toBeInTheDocument();
    });
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('menuitem', { name: '게시물 신고' }));
    expect(page.getByRole('textbox', { name: '게시물 신고 상세 내용' })).toHaveValue('');
    expect(page.getByRole('radio', { name: '유해하거나 부적절한 콘텐츠' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  },
};

export const BlockActionAfterReport: Story = {
  parameters: {
    relay: {
      ...baseMeta.parameters.relay,
      operationResponses: {
        ProfileBlockActionBlockMutation: {
          sequence: [
            { data: { blockProfile: { profileBlock: null, success: false } } },
            {
              data: {
                blockProfile: {
                  profileBlock: {
                    id: 'content-report-profile-block',
                    targetProfile: reportAuthor,
                  },
                  success: true,
                },
              },
            },
          ],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { page } = await completeReport(canvasElement);
    const block = page.getByRole('button', { name: /차단하기/ });

    await userEvent.click(block);
    let confirmationDialog = await page.findByRole('dialog', { name: '이 프로필을 차단할까요?' });
    let confirmation = within(confirmationDialog);
    await userEvent.click(confirmation.getByRole('button', { name: '차단하기' }));
    await waitFor(() =>
      expect(page.getByRole('alert')).toHaveTextContent('프로필을 차단하지 못했어요'),
    );
    expect(page.getByText('신고가 접수되었어요')).toBeVisible();
    await waitFor(() => expect(confirmationDialog).not.toBeInTheDocument());
    await waitFor(() => expect(block).toHaveFocus());

    const document = canvasElement.ownerDocument;
    const blockBeforeRetry = {
      connected: block.isConnected,
      disabled: block.matches(':disabled') || block.getAttribute('aria-disabled') === 'true',
      focused: block === document.activeElement,
      pointerEvents: getComputedStyle(block).pointerEvents,
    };
    let retryClickDelivered = false;
    block.addEventListener(
      'click',
      () => {
        retryClickDelivered = true;
      },
      { once: true },
    );
    await userEvent.click(block);
    try {
      confirmationDialog = await page.findByRole('dialog', { name: '이 프로필을 차단할까요?' });
    } catch (error) {
      const cancelButtons = page.queryAllByRole('button', { name: '취소', hidden: true });
      const modalHosts = Array.from(document.querySelectorAll('[aria-modal="true"]'));
      console.error(
        'BlockActionAfterReport retry modal snapshot',
        JSON.stringify(
          {
            blockBeforeRetry,
            retryClickDelivered,
            blockAfterRetry: {
              connected: block.isConnected,
              disabled: block.matches(':disabled') || block.getAttribute('aria-disabled') === 'true',
              focused: block === document.activeElement,
              pointerEvents: getComputedStyle(block).pointerEvents,
            },
            cancelButtons: cancelButtons.map((button) => {
              const host = button.closest('[aria-modal="true"]');
              const style = getComputedStyle(button);
              return {
                connected: button.isConnected,
                focused: button === document.activeElement,
                hidden: button.hidden,
                attributes: Array.from(button.attributes).map(({ name, value }) => ({ name, value })),
                inert: button.closest('[inert]') !== null,
                display: style.display,
                visibility: style.visibility,
                modalHostIndex: host ? modalHosts.indexOf(host) : null,
              };
            }),
            modalHosts: modalHosts.map((host) => {
              const style = getComputedStyle(host);
              return {
                attributes: Array.from(host.attributes).map(({ name, value }) => ({ name, value })),
                inert: host.hasAttribute('inert') || host.closest('[inert]') !== null,
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                containsCancel: cancelButtons.some((button) => host.contains(button)),
              };
            }),
            activeElement: {
              tagName: document.activeElement?.tagName,
              role: document.activeElement?.getAttribute('role'),
              label: document.activeElement?.getAttribute('aria-label'),
              text: document.activeElement?.textContent?.trim().slice(0, 100),
            },
            story: {
              canvasConnected: canvasElement.isConnected,
              parentConnected: canvasElement.parentElement?.isConnected ?? false,
            },
          },
          null,
          2,
        ),
      );
      throw error;
    }
    confirmation = within(confirmationDialog);
    await userEvent.click(confirmation.getByRole('button', { name: '차단하기' }));
    await waitFor(() => {
      expect(page.queryByRole('button', { name: '게시물 신고 닫기' })).not.toBeInTheDocument();
      expect(page.queryByText('신고가 접수되었어요')).not.toBeInTheDocument();
    });
    await waitFor(() => expect(page.getByRole('button', { name: '신고 메뉴 열기' })).toHaveFocus());
  },
};

export const BlockActionHiddenForSelf: Story = {
  render: () => <ContentReportPreview reportProfileId="content-report-self" />,
  play: async ({ canvasElement }) => {
    const { page } = await completeReport(canvasElement);
    expect(page.queryByRole('button', { name: /차단하기/ })).not.toBeInTheDocument();
    expectBlockSectionHidden(page);
    expect(page.getByRole('button', { name: '완료' })).toBeVisible();
  },
};

export const BlockActionHiddenWhenAlreadyBlocked: Story = {
  render: () => <ContentReportPreview reportProfileId="content-report-blocked" />,
  play: async ({ canvasElement }) => {
    const { page } = await completeReport(canvasElement);
    expect(page.queryByRole('button', { name: /차단하기/ })).not.toBeInTheDocument();
    expectBlockSectionHidden(page);
    expect(page.getByRole('button', { name: '완료' })).toBeVisible();
  },
};

export const BlockActionHiddenWhenBlockedByTarget: Story = {
  render: () => <ContentReportPreview reportProfileId="content-report-blocked-by" />,
  play: async ({ canvasElement }) => {
    const { page } = await completeReport(canvasElement);
    expect(page.queryByRole('button', { name: /차단하기/ })).not.toBeInTheDocument();
    expectBlockSectionHidden(page);
    expect(page.getByRole('button', { name: '완료' })).toBeVisible();
  },
};

export const BlockActionHiddenWithoutSelectedProfile: Story = {
  parameters: {
    relay: {
      ...baseMeta.parameters.relay,
      data: {
        ...baseMeta.parameters.relay.data,
        currentSession: { id: 'content-report-session', selectedProfile: null },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const { page } = await completeReport(canvasElement);
    expect(page.queryByRole('button', { name: /차단하기/ })).not.toBeInTheDocument();
    expectBlockSectionHidden(page);
    expect(page.getByRole('button', { name: '완료' })).toBeVisible();
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

export const PostReportCompletionLayoutContract: Story = {
  globals: { viewport: { isRotated: false, value: 'contentReportMobileShort' } },
  parameters: {
    viewport: {
      options: {
        contentReportMobileShort: {
          name: 'Content report mobile short',
          styles: { height: '560px', width: '390px' },
          type: 'mobile',
        },
      },
    },
  },
  render: () => <ContentReportPreview reportProfileId={longReportAuthor.id} />,
  play: async ({ canvasElement }) => {
    const { page } = await completeReport(canvasElement);
    const view = canvasElement.ownerDocument.defaultView!;
    const surface = page.getByTestId('content-report-overlay-surface');
    const body = page.getByTestId('content-report-overlay-body');
    const handle = page.getByRole('heading', {
      name: `${longReportAuthor.relativeHandle} 차단`,
    });
    const result = page.getByText('서로의 게시물이 숨겨지고 팔로우가 해제돼요.');
    const block = page.getByRole('button', { name: /차단하기/ });
    const complete = page.getByRole('button', { name: '완료' });

    expect(handle).toBeVisible();
    expect(result).toBeVisible();
    await waitFor(() => expect(complete).toHaveFocus());

    const surfaceBounds = surface.getBoundingClientRect();
    const bodyBounds = body.getBoundingClientRect();
    const blockBounds = block.getBoundingClientRect();
    const completeBounds = complete.getBoundingClientRect();
    expect(surfaceBounds.left).toBeGreaterThanOrEqual(0);
    expect(surfaceBounds.right).toBeLessThanOrEqual(view.innerWidth);
    expect(surfaceBounds.top).toBeGreaterThanOrEqual(0);
    expect(surfaceBounds.bottom).toBeLessThanOrEqual(view.innerHeight);
    expect(blockBounds.width).toBeGreaterThan(bodyBounds.width * 0.8);
    expect(blockBounds.bottom).toBeLessThanOrEqual(view.innerHeight);
    expect(completeBounds.top - blockBounds.bottom).toBeGreaterThanOrEqual(24);
    expect(completeBounds.width).toBeGreaterThan(bodyBounds.width * 0.8);
    expect(completeBounds.height).toBeGreaterThanOrEqual(40);
    expect(completeBounds.bottom).toBeLessThanOrEqual(view.innerHeight);
  },
};

export const SubmissionUnknownKeepsDraftForRetry: Story = {
  parameters: {
    relay: {
      mutationRequestObserver: baseMeta.parameters.relay.mutationRequestObserver,
      mutationResponse: { submitContentReport: { status: 'UNKNOWN' } },
    },
  },
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
      mutationRequestObserver: baseMeta.parameters.relay.mutationRequestObserver,
      mutationResponse: { submitContentReport: { status: 'REJECTED' } },
    },
  },
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
