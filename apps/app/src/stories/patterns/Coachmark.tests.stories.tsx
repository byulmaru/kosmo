import baseMeta, {
  CompactContentContract as compactContentContract,
  CompactViewportContract as compactViewportContract,
  InteractionContract as interactionContract,
  Mobile320Contract as mobile320Contract,
  Mobile360Contract as mobile360Contract,
  Mobile390Contract as mobile390Contract,
  PlacementContract as placementContract,
  SharedAnchorContract as sharedAnchorContract,
  StepsInteraction as stepsInteraction,
  Tests as tests,
  TextScaleContract as textScaleContract,
  ViewportContract as viewportContract,
} from './Coachmark.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Coachmark/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const PlacementContract: Story = placementContract;
export const StepsInteraction: Story = stepsInteraction;
export const ViewportContract: Story = viewportContract;
export const CompactViewportContract: Story = compactViewportContract;
export const Tests: Story = tests;

export const CompactContentContract: Story = compactContentContract;

export const Mobile320Contract: Story = mobile320Contract;
export const Mobile360Contract: Story = mobile360Contract;
export const Mobile390Contract: Story = mobile390Contract;
export const TextScaleContract: Story = textScaleContract;

export const SharedAnchorContract: Story = sharedAnchorContract;
