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
    await expect(canvas.getByText(/기본 click ID.*utm_\*/)).toBeVisible();
    await expect(
      canvas.getByText(/일반 분석 이벤트.*구체적인 기준은 확정 후 별도로 공지/),
    ).toBeVisible();
    await expect(canvas.queryByText(/12개월.*자동 삭제/)).not.toBeInTheDocument();
    await expect(
      canvas.getByText(/구체적인 이전 항목.*실제 계약과 적용 법적 근거는 확인 중/),
    ).toBeVisible();
    await expect(canvas.getByText(/Session replay: 세션의 10%/)).toBeVisible();
    await expect(
      canvas.getByText(/ph-mask.*Replay text.*ph-no-capture.*autocapture/),
    ).toBeVisible();
    await expect(canvas.queryByText(/OpenPanel/)).not.toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'KOSMO로 돌아가기' })).toHaveAttribute(
      'href',
      '/',
    );
  },
};
