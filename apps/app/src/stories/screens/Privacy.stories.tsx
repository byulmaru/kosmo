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
    const tables = canvas.getAllByRole('table');
    const expectedTableDimensions = [
      [5, 4],
      [1, 4],
      [4, 2],
      [2, 5],
    ] as const;

    expect(tables).toHaveLength(expectedTableDimensions.length);

    for (const [index, [bodyRowCount, columnCount]] of expectedTableDimensions.entries()) {
      const table = tables[index]!;
      const rows = within(table).getAllByRole('row');
      const headerRow = rows[0]!;

      expect(rows).toHaveLength(bodyRowCount + 1);
      expect(within(headerRow).getAllByRole('columnheader')).toHaveLength(columnCount);
      expect(within(headerRow).queryAllByRole('cell')).toHaveLength(0);

      for (const row of rows.slice(1)) {
        expect(within(row).getAllByRole('cell')).toHaveLength(columnCount);
        expect(within(row).queryAllByRole('columnheader')).toHaveLength(0);
      }
    }

    expect(within(tables[0]!).getByRole('columnheader', { name: '처리 항목' })).toBeVisible();
    expect(
      within(tables[0]!).getByRole('cell', {
        name: '계정·프로필 식별자, 사용자 이름·표시명·소개·프로필 이미지와 선택 정보',
      }),
    ).toBeVisible();
    expect(canvas.getByText('시행일: 2026년 10월 13일')).toBeVisible();
    expect(
      canvas.getByRole('link', {
        name: '이전 개인정보 처리방침 (2026년 9월 9일부터 2026년 10월 12일까지)',
      }),
    ).toBeVisible();
    expect(within(tables[0]!).getByRole('cell', { name: '탈퇴 완료일부터 30일' })).toBeVisible();
    expect(
      within(tables[0]!).getByRole('cell', {
        name: '콘텐츠 삭제·관계 종료 또는 목적 달성 시까지. 탈퇴 완료일부터 30일',
      }),
    ).toBeVisible();
    expect(within(tables[0]!).getByRole('cell', { name: '수집일부터 12개월' })).toBeVisible();
    expect(within(tables[3]!).getByRole('cell', { name: '독일(프랑크푸르트)' })).toBeVisible();
    expect(canvas.getByText(/이용자와 법정대리인은 개인정보의 열람·전송/)).toBeVisible();
    expect(
      canvas.getAllByRole('link', { name: 'hello@byulmaru.co로 이메일 보내기' })[0],
    ).toBeVisible();
    expect(canvas.queryByText(/탈퇴하려는 Kosmo 계정으로 로그인한 뒤/)).not.toBeInTheDocument();
  },
};
