import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  InteractionContract as interactionContract,
  MobileCandidateContract as mobileCandidateContract,
  MobileKeyboardContract as mobileKeyboardContract,
  MobileKeyboardMediaFooterGeometryContract as mobileKeyboardMediaFooterGeometryContract,
  MobileMediaFooterGeometryContract as mobileMediaFooterGeometryContract,
  MobilePlayground as mobilePlaygroundStory,
  MobilePlaygroundContract as mobilePlaygroundContract,
  PendingMediaContract as pendingMediaContract,
  Playground as playgroundContract,
  RailMedia as railMediaStory,
  SubmitFailure as submitFailureStory,
} from './PostComposer.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Post Composer Target/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const MobileKeyboardMediaFooterGeometryContract: Story =
  mobileKeyboardMediaFooterGeometryContract;
export const MobileCandidateContract: Story = mobileCandidateContract;
export const MobileKeyboardContract: Story = mobileKeyboardContract;
export const MobileMediaFooterGeometryContract: Story = mobileMediaFooterGeometryContract;
export const MobilePlaygroundContract: Story = mobilePlaygroundContract;
export const PendingMediaContract: Story = pendingMediaContract;

export const ControlsContract: Story = {
  play: async () => {
    expect(baseMeta.parameters?.controls).toMatchObject({ disable: true });
    const playgroundControls = playgroundContract.parameters?.controls;
    expect(playgroundControls).toHaveProperty('include');
    expect(playgroundControls?.include).not.toContain('error');
    expect(baseMeta.argTypes?.author?.control).toBe(false);
    expect(baseMeta.argTypes?.items?.control).toBe(false);
    expect(baseMeta.argTypes?.remaining?.control).toBe(false);
    expect(baseMeta.argTypes?.showPollAction?.control).toBe(false);
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

export const EmojiOutsideDismissContract: Story = {
  ...playgroundContract,
  args: { body: '이모지 위치를 확인할 본문', items: [], surface: 'rail' },
  globals: { viewport: { isRotated: false, value: 'postComposerPicker' } },
  parameters: {
    viewport: {
      options: {
        postComposerPicker: {
          name: 'Post Composer picker',
          styles: { height: '1200px', width: '600px' },
          type: 'tablet',
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '이모지 추가' }));

    const picker = await canvas.findByTestId('post-composer-emoji-picker');
    const trigger = canvas.getByRole('button', { name: '이모지 추가' });
    expect(picker).toBeVisible();
    expect(picker.getBoundingClientRect().right).toBeLessThanOrEqual(
      canvasElement.ownerDocument.defaultView!.innerWidth,
    );
    expect(picker.getBoundingClientRect().right).toBeGreaterThanOrEqual(
      trigger.getBoundingClientRect().left,
    );
    expect(picker.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      trigger.getBoundingClientRect().bottom,
    );

    await userEvent.click(canvas.getByRole('button', { name: '반응 선택 닫기' }));
    expect(canvas.queryByTestId('post-composer-emoji-picker')).toBeNull();
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
    const scroll = within(dialog).getByTestId('composer-overlay-scroll');

    expect(getComputedStyle(within(dialog).getByTestId('composer-overlay-surface')).overflow).toBe(
      'hidden',
    );
    expect(getComputedStyle(scroll).overflowY).toBe('auto');
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    scroll.scrollTop = scroll.scrollHeight;
    expect(scroll.scrollTop).toBeGreaterThan(0);

    await userEvent.click(within(dialog).getByRole('button', { name: '첨부 이미지 2 편집' }));
    expect(within(dialog).getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    expect(within(dialog).getByTestId('composer-overlay-scroll').scrollTop).toBe(0);
  },
};
