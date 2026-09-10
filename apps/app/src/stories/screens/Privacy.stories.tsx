import { expect, within } from 'storybook/test';
import PrivacyScreen from '@/app/privacy';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: PrivacyScreen,
  parameters: { router: { pathname: '/privacy' } },
  title: 'KOSMO/Screens/Privacy',
} satisfies Meta<typeof PrivacyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Policy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Kosmo 개인정보 처리방침' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'KOSMO로 돌아가기' })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(canvas.getByRole('link', { name: '계정 삭제 안내' })).toHaveAttribute(
      'href',
      '/account-deletion',
    );
    await expect(canvas.getByRole('link', { name: '아동 안전 정책' })).toHaveAttribute(
      'href',
      '/child-safety',
    );
  },
};
