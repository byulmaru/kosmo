import baseMeta, {
  DesktopOverlayCreatePostFailure as desktopOverlayCreatePostFailure,
  DesktopOverlayVisibleViewportContract as desktopOverlayVisibleViewportContract,
  MobileFullscreenCreatePostFailure as mobileFullscreenCreatePostFailure,
  MobileFullscreenVisibleViewportContract as mobileFullscreenVisibleViewportContract,
  RailCreatePostFailure as railCreatePostFailure,
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
export const DesktopOverlayCreatePostFailure: Story = desktopOverlayCreatePostFailure;
export const MobileFullscreenCreatePostFailure: Story = mobileFullscreenCreatePostFailure;
export const RailCreatePostFailure: Story = railCreatePostFailure;
