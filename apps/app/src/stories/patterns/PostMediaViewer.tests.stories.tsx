import baseMeta, {
  BoundaryMovementContract as boundaryMovementContract,
  CompactLongBodyContract as compactLongBodyContract,
  CompactProductionActionSurfaceContract as compactProductionActionSurfaceContract,
  ErrorRetryContract as errorRetryContract,
  PlaygroundInteractionContract as playgroundInteractionContract,
  WideRailCompositionContract as wideRailCompositionContract,
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
export const PlaygroundInteractionContract: Story = playgroundInteractionContract;
export const CompactProductionActionSurfaceContract: Story = compactProductionActionSurfaceContract;
export const CompactLongBodyContract: Story = compactLongBodyContract;
export const ErrorRetryContract: Story = errorRetryContract;
export const WideRailCompositionContract: Story = wideRailCompositionContract;
