import { expect, userEvent, within } from 'storybook/test';
import PrivacyChangeNoticeScreen from '@/app/privacy/changes/2026-10-13';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: PrivacyChangeNoticeScreen,
  parameters: { router: { pathname: '/privacy/changes/2026-10-13' } },
  title: 'KOSMO/Screens/Privacy change notice',
} satisfies Meta<typeof PrivacyChangeNoticeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Notice: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(canvas.getByRole('heading', { name: '개인정보처리방침 개정 안내' })).toBeVisible();
    expect(canvas.getByText('시행일: 2026년 10월 13일')).toBeVisible();
    expect(
      canvas.getByText(
        '이 안내는 2026년 9월 9일 시행한 이전 개인정보처리방침과 2026년 10월 13일 시행한 개정 방침의 주요 차이를 정리한 것입니다.',
      ),
    ).toBeVisible();

    for (const text of [
      '웹 이용 분석 관련 고지를 OpenPanel에서 PostHog Cloud 기준으로 바꾸고, 이전 방침의 세션 리플레이 수집 항목을 삭제했습니다.',
      'PostHog의 국외 이전 고지를 추가해 이전받는 자, 독일(프랑크푸르트)로의 이전, 이전 항목·목적·방법·보유기간과 법적 근거를 명시했습니다.',
      '분석 목적 달성·계정 삭제·이용자 요청 등을 기준으로 하던 분석 정보의 보유기간을 변경했습니다. 일반 분석 이벤트는 수집일부터 12개월, 분석용 사용자 정보는 계정 이용 중과 탈퇴 완료 후 30일 동안 보유하도록 구분했습니다.',
      '계정·프로필 정보, 게시글·관계 기록과 접속기록의 보유기간에 탈퇴 완료일부터 30일을 명시했습니다. 진행 중인 신고·분쟁·수사기관 요청에 필요한 기록과 법정 보존 대상의 별도 보관 기준도 정리했습니다.',
    ]) {
      expect(canvas.getByText(text)).toBeVisible();
    }

    expect(canvas.getByRole('link', { name: '현재 개인정보처리방침' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(
      canvas.getByRole('link', { name: '이전 개인정보처리방침 (2026년 9월 9일 시행)' }),
    ).toHaveAttribute('href', '/privacy/2026-09-09');
    expect(canvas.getByRole('link', { name: 'hello@byulmaru.co로 이메일 보내기' })).toHaveAttribute(
      'href',
      'mailto:hello@byulmaru.co',
    );

    await userEvent.tab();
    expect(canvas.getByRole('link', { name: 'KOSMO로 돌아가기' })).toHaveFocus();
  },
};
