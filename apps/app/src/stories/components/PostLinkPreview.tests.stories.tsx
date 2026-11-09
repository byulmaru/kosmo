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
