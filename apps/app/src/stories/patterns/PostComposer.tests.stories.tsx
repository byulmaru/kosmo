import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  InteractionContract as interactionContract,
  MobileCandidateContract as mobileCandidateContract,
  MobileKeyboardContract as mobileKeyboardContract,
  PendingMediaContract as pendingMediaContract,
  StateContract as stateContract,
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
export const MobileCandidateContract: Story = mobileCandidateContract;
export const MobileKeyboardContract: Story = mobileKeyboardContract;
export const PendingMediaContract: Story = pendingMediaContract;
export const StateContract: Story = stateContract;

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
    const getSurface = () =>
      dialog.firstElementChild?.firstElementChild?.firstElementChild as HTMLElement | null;
    const surface = getSurface();

    expect(surface).not.toBeNull();
    expect(getComputedStyle(surface!).overflowY).toBe('auto');
    expect(surface!.scrollHeight).toBeGreaterThan(surface!.clientHeight);
    surface!.scrollTop = surface!.scrollHeight;
    expect(surface!.scrollTop).toBeGreaterThan(0);

    await userEvent.click(within(dialog).getByRole('button', { name: '첨부 이미지 2 편집' }));
    expect(within(dialog).getByRole('heading', { name: '미디어 편집' })).toBeVisible();
    expect(getSurface()!.scrollTop).toBe(0);
  },
};
