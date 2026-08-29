import baseMeta, {
  BoundaryMovementContract as boundaryMovementContract,
  SensitiveRevealContract as sensitiveRevealContract,
} from './PostMediaViewer.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Post Media Viewer/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BoundaryMovementContract: Story = boundaryMovementContract;
export const SensitiveRevealContract: Story = sensitiveRevealContract;
