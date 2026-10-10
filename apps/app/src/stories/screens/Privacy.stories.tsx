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
      [4, 2],
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
        name: '별마루 Account ID, Profile ID, handle, 표시명, 소개, 이미지와 선택 프로필 정보',
      }),
    ).toBeVisible();
  },
};
