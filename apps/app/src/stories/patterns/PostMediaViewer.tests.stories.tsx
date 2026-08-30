import baseMeta, {
  BoundaryMovementContract as boundaryMovementContract,
  CompactProductionActionSurfaceContract as compactProductionActionSurfaceContract,
  ErrorRetryContract as errorRetryContract,
  Playground as playground,
  SensitiveRevealContract as sensitiveRevealContract,
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
export const Playground: Story = playground;
export const CompactProductionActionSurfaceContract: Story = compactProductionActionSurfaceContract;
export const SensitiveRevealContract: Story = sensitiveRevealContract;
export const ErrorRetryContract: Story = errorRetryContract;
export const WideRailCompositionContract: Story = wideRailCompositionContract;
