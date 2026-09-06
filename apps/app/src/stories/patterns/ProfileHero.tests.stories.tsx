import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  CenterGeometryContract as centerGeometryContract,
  ImageAndTagsContract as imageAndTagsContract,
  LoadingGeometryContract as loadingGeometryContract,
  MobileGeometryContract as mobileGeometryContract,
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

export const MobileFollowError: Story = {
  args: { containerWidth: 390 },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { relay: { mutationError: '팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    const alert = await canvas.findByRole('alert');
    await canvasElement.ownerDocument.fonts.ready;
    const heading = canvas.getByRole('heading', { name: '프로필 히어로' });
    const surface = canvas.getByTestId('profile-hero-surface').getBoundingClientRect();
    const bounds = alert.getBoundingClientRect();
    expect(surface.width).toBe(390);
    expect(bounds.bottom).toBeLessThanOrEqual(heading.getBoundingClientRect().top);
    expect(bounds.left).toBeGreaterThanOrEqual(surface.left);
    expect(bounds.right).toBeLessThanOrEqual(surface.right);
    expect(canvas.getByRole('button', { name: '팔로우' })).toBeEnabled();
  },
};
