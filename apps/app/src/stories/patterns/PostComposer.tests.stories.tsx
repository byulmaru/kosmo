import { useState } from 'react';
import { Text, View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { PostComposer } from '@/components/post/PostComposer';
import baseMeta, {
  ActionSemanticsContract as actionSemanticsContract,
  Error as errorStory,
  InteractionContract as interactionContract,
  MobileCandidateContract as mobileCandidateContract,
  MobileFlexLayoutContract as mobileFlexLayoutContract,
  MobileKeyboardContract as mobileKeyboardContract,
  MobileKeyboardCWEditorGeometryContract as mobileKeyboardCWEditorGeometryContract,
  MobileKeyboardMediaEditorGeometryContract as mobileKeyboardMediaEditorGeometryContract,
  MobileKeyboardMediaFooterGeometryContract as mobileKeyboardMediaFooterGeometryContract,
  MobileMediaFooterGeometryContract as mobileMediaFooterGeometryContract,
  MobilePlayground as mobilePlaygroundStory,
  MobilePlaygroundContract as mobilePlaygroundContract,
  MobileRuntimeAltEditorContract as mobileRuntimeAltEditorContract,
  OverlayGeometryContract as overlayGeometryContract,
  OverlayOverflowScrollContract as overlayOverflowScrollContract,
  OverlayProgressRingContract as overlayProgressRingContract,
  PendingMediaContract as pendingMediaContract,
  Playground as playgroundContract,
  ProgressRingToneContract as progressRingToneContract,
  RailBodyMaxHeightContract as railBodyMaxHeightContract,
  RailFocusBoundaryContract as railFocusBoundaryContract,
  RailGeometryContract as railGeometryContract,
  RailMedia as railMediaStory,
  RailProgressRingContract as railProgressRingContract,
  SubmitFailure as submitFailureStory,
  SubmittingPickerContract as submittingPickerContract,
  SubmittingSpinnerContract as submittingSpinnerContract,
  SubmittingVisibilityContract as submittingVisibilityContract,
  WebModalLayoutContract as webModalLayoutContract,
} from './PostComposer.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Post Composer/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActionSemanticsContract: Story = actionSemanticsContract;
export const InteractionContract: Story = interactionContract;
export const MobileKeyboardMediaFooterGeometryContract: Story =
  mobileKeyboardMediaFooterGeometryContract;
export const MobileCandidateContract: Story = mobileCandidateContract;
export const MobileQuoteFlowContract: Story = {
  ...mobilePlaygroundStory,
  args: {
    ...mobilePlaygroundStory.args,
    body: '',
    children: (
      <View testID="mobile-quote-context-preview">
        <Text>인용 원문</Text>
      </View>
    ),
    items: [],
    mode: 'quote',
    remaining: 500,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '인용 게시글 본문' });
    const quote = canvas.getByTestId('mobile-quote-context-preview');
    const initialBodyBounds = body.getBoundingClientRect();
    const initialQuoteTop = quote.getBoundingClientRect().top;

    expect(initialBodyBounds.height).toBeLessThanOrEqual(60);
    expect(initialQuoteTop - initialBodyBounds.bottom).toBeLessThanOrEqual(16);
    await userEvent.type(body, '첫째 줄{Enter}둘째 줄{Enter}셋째 줄');
    await waitFor(() => expect(quote.getBoundingClientRect().top).toBeGreaterThan(initialQuoteTop));
  },
};
export const MobileKeyboardContract: Story = mobileKeyboardContract;
export const MobileKeyboardCWEditorGeometryContract: Story = mobileKeyboardCWEditorGeometryContract;
export const MobileKeyboardMediaEditorGeometryContract: Story =
  mobileKeyboardMediaEditorGeometryContract;
export const MobileMediaFooterGeometryContract: Story = mobileMediaFooterGeometryContract;
export const MobilePlaygroundContract: Story = mobilePlaygroundContract;
export const MobileRuntimeAltEditorContract: Story = mobileRuntimeAltEditorContract;
export const MobileFlexLayoutContract: Story = mobileFlexLayoutContract;
export const OverlayGeometryContract: Story = overlayGeometryContract;
export const OverlayOverflowScrollContract: Story = overlayOverflowScrollContract;
export const WebModalLayoutContract: Story = {
  ...webModalLayoutContract,
  parameters: { controls: { disable: true } },
};
export const OverlayProgressRingContract: Story = overlayProgressRingContract;
export const PendingMediaContract: Story = pendingMediaContract;
export const ProgressRingToneContract: Story = progressRingToneContract;
export const RailGeometryContract: Story = railGeometryContract;
export const RailBodyMaxHeightContract: Story = railBodyMaxHeightContract;
export const RailFocusBoundaryContract: Story = railFocusBoundaryContract;
export const RailProgressRingContract: Story = railProgressRingContract;

export const ReplyModeContract: Story = {
  ...playgroundContract,
  args: {
    ...playgroundContract.args,
    body: '',
    beforeEditor: <Text testID="reply-context-preview">Parent preview</Text>,
    items: [],
    mode: 'reply',
    remaining: 500,
    surface: 'overlay',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByTestId('reply-context-preview')).toBeVisible();
    expect(canvas.getByRole('textbox', { name: '답글 본문' })).toHaveAttribute(
      'placeholder',
      '무슨 일이 일어나고 있나요?',
    );
    const submit = canvas.getByRole('button', { name: '답글 게시' });
    expect(submit).toHaveTextContent(/^게시$/);
    expect(submit).toBeDisabled();
  },
};

export const QuoteModeContract: Story = {
  ...ReplyModeContract,
  args: {
    ...ReplyModeContract.args,
    beforeEditor: undefined,
    mode: 'quote',
  },
  render: (args) => (
    <PostComposer {...args}>
      <View testID="quote-context-preview" />
    </PostComposer>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '인용 게시글 본문' });
    const quote = canvas.getByTestId('quote-context-preview');
    expect(quote).toBeVisible();
    expect(body.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(body).toHaveAttribute('placeholder', '무슨 일이 일어나고 있나요?');
    const submit = canvas.getByRole('button', { name: '인용 게시' });
    expect(submit).toHaveTextContent(/^게시$/);
    expect(submit).toBeDisabled();
  },
};

export const ProgrammaticBodyResetHeightContract: Story = {
  ...playgroundContract,
  args: {
    ...playgroundContract.args,
    body: '긴 본문\n'.repeat(40),
    items: [],
    remaining: 500,
    surface: 'rail',
  },
  render: (args) => {
    const [body, setBody] = useState(args.body);
    return (
      <PostComposer
        {...args}
        body={body}
        onBodyChange={setBody}
        onSubmit={() => {
          args.onSubmit();
          setBody('');
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByRole('textbox', { name: '게시글 본문' });
    await waitFor(() => expect(body.getBoundingClientRect().height).toBe(300));

    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    await waitFor(() => expect(body).toHaveValue(''));
    await waitFor(() => expect(body.getBoundingClientRect().height).toBeLessThan(300));
  },
};
export const SubmittingPickerContract: Story = submittingPickerContract;
export const SubmittingSpinnerContract: Story = submittingSpinnerContract;
export const SubmittingVisibilityContract: Story = submittingVisibilityContract;

export const MediaFailureRecoveryContract: Story = {
  ...errorStory,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole('alert')).toBeNull();
    expect(canvas.getByLabelText('첨부 이미지 1, 업로드 실패')).toBeVisible();
    expect(canvas.getByRole('button', { name: '1번째 이미지 업로드 다시 시도' })).toBeVisible();
  },
};

export const DerivedRemainingContract: Story = {
  ...playgroundContract,
  args: {
    body: ' 본문 ',
    contentWarning: ' 경고 ',
    items: [],
    remaining: 500,
    surface: 'rail',
  },
  play: async ({ canvasElement }) => {
    expect(await within(canvasElement).findByLabelText('남은 글자 수 496자')).toBeVisible();
  },
};

export const PollActionHiddenContract: Story = {
  ...playgroundContract,
  args: { body: '게시할 본문', items: [], surface: 'rail' },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: '투표 추가' })).toBeNull();
  },
};

export const PlaygroundPollOverrideContract: Story = {
  ...playgroundContract,
  args: { body: 'Playground Poll override', items: [], showPollAction: true, surface: 'rail' },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: '투표 추가' })).toBeNull();
  },
};

export const MobilePlaygroundPollOverrideContract: Story = {
  ...mobilePlaygroundStory,
  args: { items: [], showPollAction: true, surface: 'overlay' },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).queryByRole('button', { name: '투표 추가' })).toBeNull();
  },
};

export const SubmitFailureToastContract: Story = {
  ...submitFailureStory,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '게시' }));
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      '게시글을 작성하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(canvas.queryByText('제출 실패를 확인할 본문')).toBeInTheDocument();
  },
};

export const EmojiPickerLifecycleContract: Story = {
  ...playgroundContract,
  args: { body: '이모지 위치를 확인할 본문', items: [], surface: 'rail' },
  globals: { viewport: { isRotated: false, value: 'postComposerPicker' } },
  parameters: {
    viewport: {
      options: {
        postComposerPicker: {
          name: 'Post Composer picker',
          styles: { height: '1440px', width: '600px' },
          type: 'tablet',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '이모지 추가' });
    await userEvent.click(trigger);

    const picker = await canvas.findByTestId('post-composer-emoji-picker');
    expect(picker).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('searchbox', { name: '반응 검색' })).toHaveFocus());
    expect(picker.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.ownerDocument.defaultView!.innerWidth,
    );
    expect(picker.getBoundingClientRect().right).toBeGreaterThanOrEqual(
      trigger.getBoundingClientRect().left,
    );
    expect(picker.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      trigger.getBoundingClientRect().bottom,
    );

    const [reaction] = canvas.getAllByRole('button', { name: '감동 🥹' });
    reaction.focus();
    expect(reaction).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.queryByTestId('post-composer-emoji-picker')).toBeNull());
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(trigger);
    await waitFor(() => expect(canvas.queryByTestId('post-composer-emoji-picker')).toBeNull());
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole('button', { name: '반응 선택 닫기' }));
    expect(canvas.queryByTestId('post-composer-emoji-picker')).toBeNull();
    expect(trigger).toHaveFocus();
  },
};

export const RailMediaReachabilityContract: Story = {
  ...railMediaStory,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fixture = canvas.getByTestId('post-composer-rail-media-reachability');
    const gallery = within(fixture).getByLabelText('첨부 이미지 갤러리, 3개');

    expect(gallery.scrollWidth).toBeGreaterThan(gallery.clientWidth);
    gallery.scrollLeft = gallery.scrollWidth;
    expect(gallery.scrollLeft).toBeGreaterThan(0);
  },
};

export const ShortViewportContract: Story = {
  ...interactionContract,
  globals: { viewport: { isRotated: false, value: 'postComposerShort' } },
  parameters: {
    viewport: {
      options: {
        postComposerShort: {
          name: 'Post Composer short',
          styles: { height: '380px', width: '600px' },
          type: 'tablet',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: 'Composer 확장' }));

    const dialog = page.getByRole('dialog', { name: '글쓰기' });
    const outerScroll = within(dialog).getByTestId('composer-overlay-scroll');
    const scroll = within(dialog).getByTestId('post-composer-scroll');
    const surface = within(dialog).getByTestId('composer-overlay-surface');
    const target = within(dialog).getByTestId('post-composer-target');
    const viewportHeight = canvasElement.ownerDocument.defaultView!.innerHeight;
    const hostHeight = viewportHeight - 96;
    const headerHeight = 64;

    expect(getComputedStyle(within(dialog).getByTestId('composer-overlay-surface')).overflow).toBe(
      'hidden',
    );
    expect(surface.getBoundingClientRect().height).toBeCloseTo(hostHeight, 0);
    expect(target.getBoundingClientRect().height).toBeCloseTo(hostHeight - headerHeight, 0);
    expect(surface.getBoundingClientRect().height).toBeCloseTo(
      target.getBoundingClientRect().height + headerHeight,
      0,
    );
    expect(getComputedStyle(scroll).overflowY).toBe('auto');
    expect(getComputedStyle(outerScroll).overflow).toBe('hidden');
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    scroll.scrollTop = scroll.scrollHeight;
    expect(scroll.scrollTop).toBeGreaterThan(0);

    await userEvent.click(within(dialog).getByRole('button', { name: '콘텐츠 경고 켜기' }));
    const visibility = within(dialog).getByRole('button', { name: '공개 범위: 조용한 공개' });
    const contentWarning = within(dialog).getByRole('textbox', { name: '콘텐츠 경고' });
    const submit = within(dialog).getByRole('button', { name: '게시' });
    const visibilityTop = visibility.getBoundingClientRect().top;
    const contentWarningTop = contentWarning.getBoundingClientRect().top;
    const submitTop = submit.getBoundingClientRect().top;

    scroll.scrollTop = scroll.scrollHeight;
    expect(scroll.scrollTop).toBeGreaterThan(0);
    expect(visibility.getBoundingClientRect().top).toBe(visibilityTop);
    expect(contentWarning.getBoundingClientRect().top).toBe(contentWarningTop);
    expect(submit.getBoundingClientRect().top).toBe(submitTop);

    await userEvent.click(within(dialog).getByRole('button', { name: '이모지 추가' }));
    const picker = page.getByTestId('post-composer-emoji-picker');
    const pickerGap = 8;
    expect(picker).toHaveStyle({
      height: `${canvasElement.ownerDocument.defaultView!.innerHeight - pickerGap * 2}px`,
    });
    expect(picker.getBoundingClientRect().top).toBeGreaterThanOrEqual(pickerGap);
    expect(picker.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      canvasElement.ownerDocument.defaultView!.innerHeight - pickerGap,
    );
    await userEvent.click(page.getByRole('button', { name: '반응 선택 닫기' }));

    await userEvent.click(within(dialog).getByRole('button', { name: '첨부 이미지 2 편집' }));
    expect(within(dialog).getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    expect(outerScroll.scrollTop).toBe(0);
  },
};
