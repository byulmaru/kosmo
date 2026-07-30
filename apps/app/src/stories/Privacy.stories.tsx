import { expect, within } from 'storybook/test';
import PrivacyScreen from '@/app/privacy';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: PrivacyScreen,
  parameters: { router: { pathname: '/privacy' } },
  title: 'KOSMO/Legal/Privacy',
} satisfies Meta<typeof PrivacyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Policy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Kosmo 개인정보 처리방침' })).toBeVisible();
    await expect(canvas.getByText('시행일: 2026년 7월 29일')).toBeVisible();
    await expect(canvas.getByText('9. 자동 수집 정보와 행태정보')).toBeVisible();
    await expect(canvas.getByText(/Session replay: 세션의 10%/)).toBeVisible();
    await expect(
      canvas.getByText(/모든 input·textarea 값은 마스킹하고 게시글 본문 영역은 기록에서 제외/),
    ).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'KOSMO로 돌아가기' })).toHaveAttribute(
      'href',
      '/',
    );
  },
};
