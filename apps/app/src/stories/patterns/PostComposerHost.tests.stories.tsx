import baseMeta, {
  DesktopOverlayVisibleViewportContract as desktopOverlayVisibleViewportContract,
  MobileFullscreenVisibleViewportContract as mobileFullscreenVisibleViewportContract,
} from './PostComposerHost.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Post Composer Host/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const MobileFullscreenVisibleViewportContract: Story =
  mobileFullscreenVisibleViewportContract;
export const DesktopOverlayVisibleViewportContract: Story = desktopOverlayVisibleViewportContract;
