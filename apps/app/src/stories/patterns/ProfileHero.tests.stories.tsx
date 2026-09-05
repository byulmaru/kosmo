import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  CenterGeometryContract as centerGeometryContract,
  ImageAndTagsContract as imageAndTagsContract,
  LoadingGeometryContract as loadingGeometryContract,
  MobileGeometryContract as mobileGeometryContract,
  MuteContract as muteContract,
  MutedLoadingContract as mutedLoadingContract,
} from './ProfileHero.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/ProfileHero/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CenterGeometryContract: Story = centerGeometryContract;
export const MobileGeometryContract: Story = mobileGeometryContract;
export const LoadingGeometryContract: Story = loadingGeometryContract;
export const ImageAndTagsContract: Story = imageAndTagsContract;
export const MuteContract: Story = muteContract;
export const MutedLoadingContract: Story = mutedLoadingContract;

export const MobileFollowError: Story = {
  args: { containerWidth: 390 },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { relay: { mutationError: '팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: '팔로우' });
    const surface = canvas.getByTestId('profile-hero-surface');
    await userEvent.click(button);
    const alert = await within(canvasElement.ownerDocument.body).findByRole('alert');
    expect(surface.contains(alert)).toBe(false);
    expect(alert).toHaveTextContent('팔로우 상태를 변경하지 못했습니다.');
    expect(button).toBeEnabled();
  },
};
