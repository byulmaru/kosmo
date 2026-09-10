import { expect, within } from 'storybook/test';
import AccountDeletionScreen from '@/app/account-deletion';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: AccountDeletionScreen,
  parameters: { router: { pathname: '/account-deletion' } },
  title: 'KOSMO/Screens/Account deletion',
} satisfies Meta<typeof AccountDeletionScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Policy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Kosmo 계정 삭제 안내' })).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'hello@byulmaru.co로 이메일 보내기' }),
    ).toHaveAttribute('href', 'mailto:hello@byulmaru.co');
    await expect(canvas.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await expect(canvas.getByRole('link', { name: '아동 안전 정책' })).toHaveAttribute(
      'href',
      '/child-safety',
    );
  },
};
