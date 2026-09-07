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
    await expect(canvas.getByText('시행일: 별도 공지')).toBeVisible();
    await expect(canvas.getByText('9. 자동 수집 정보와 행태정보')).toBeVisible();
    await expect(canvas.getByText('PostHog 제품 분석')).toBeVisible();
    await expect(canvas.getByText(/pageview·pageleave·autocapture/)).toBeVisible();
    await expect(canvas.getByText(/feature flag와 remote config 요청/)).toBeVisible();
    await expect(canvas.getByText(/Session Replay: 세션의 10%/)).toBeVisible();
    await expect(
      canvas.getByText(/ph-mask는 Replay에서 해당 영역의 텍스트를 masking/),
    ).toBeVisible();
    await expect(
      canvas.getByText(/ph-no-capture는 해당 DOM subtree를 autocapture에서 제외/),
    ).toBeVisible();
    await expect(canvas.getByText(/cookie 또는 localStorage/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'KOSMO로 돌아가기' })).toHaveAttribute(
      'href',
      '/',
    );
  },
};
