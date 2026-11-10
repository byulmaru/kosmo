import { expect, waitFor, within } from 'storybook/test';
import ogDefaultUrl from '../../../public/og-default.png?url';
import baseMeta, { InteractionContract as interactionContract } from './PostLinkPreview.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostLinkPreviewData } from '@/components/post/PostLinkPreview';

type Args = Readonly<{ interactive: boolean; preview: PostLinkPreviewData }>;

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Components/Post Link Preview/Tests',
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;

export const LargeImageGeometry: Story = {
  args: {
    interactive: false,
    preview: {
      description: null,
      imageHeight: 400,
      imageUrl: ogDefaultUrl,
      imageWidth: 600,
      title: '게시글 링크 미리보기',
      url: 'https://example.com/article',
    },
  },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByTestId('post-link-preview-card');
    const view = canvasElement.ownerDocument.defaultView;
    const imageFrame =
      view &&
      Array.from(card.querySelectorAll('div')).find(
        (element) => view.getComputedStyle(element).backgroundImage !== 'none',
      );
    const title = canvas.getByText(args.preview.title);
    if (!imageFrame || !view) {
      throw new Error('The preview card and image must render in a browser.');
    }

    await waitFor(() => {
      const imageRect = imageFrame.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const imageStyle = view.getComputedStyle(imageFrame);
      const cardStyle = view.getComputedStyle(card);
      const availableWidth =
        card.clientWidth -
        Number.parseFloat(cardStyle.paddingLeft) -
        Number.parseFloat(cardStyle.paddingRight);

      expect(imageRect.width).toBeCloseTo(availableWidth, 0);
      expect(imageRect.width / imageRect.height).toBeCloseTo(16 / 9, 2);
      expect(imageRect.bottom).toBeLessThan(titleRect.top);
      expect(imageStyle.backgroundSize).toBe('cover');
    });
  },
};
