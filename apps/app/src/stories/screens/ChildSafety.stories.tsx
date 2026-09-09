import { expect, within } from 'storybook/test';
import ChildSafetyScreen from '@/app/child-safety';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: ChildSafetyScreen,
  parameters: { router: { pathname: '/child-safety' } },
  title: 'KOSMO/Screens/Child safety',
} satisfies Meta<typeof ChildSafetyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Policy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Kosmo 아동 안전 정책' })).toBeVisible();
    await expect(canvas.getByText('시행일: 2026년 9월 9일')).toBeVisible();
    await expect(canvas.getByText('우리의 원칙')).toBeVisible();
    await expect(canvas.getByText(/아동 성적 학대·착취\(CSAE\)/)).toBeVisible();
    await expect(
      canvas.getByText(/관계 기관 신고 등 법률상 필요한 조치를 이행합니다/),
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'hello@byulmaru.co로 이메일 보내기' }),
    ).toHaveAttribute('href', 'mailto:hello@byulmaru.co');
    await expect(canvas.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    await expect(canvas.getByRole('link', { name: '계정 삭제 안내' })).toHaveAttribute(
      'href',
      '/account-deletion',
    );
  },
};
