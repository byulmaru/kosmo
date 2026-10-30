import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta, {
  Compact1024 as compact1024,
  InitialErrorRetry as initialErrorRetry,
  Mobile390 as mobile390,
} from './GuestLocal.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  title: 'KOSMO/Screens/Guest Local/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompactBrandMark: Story = {
  ...compact1024,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navigation = await canvas.findByRole('navigation', { name: '주요 메뉴' });
    const menu = within(navigation);
    const logo = menu.getByLabelText('KOSMO 로고');
    const signup = menu.getByRole('link', { name: '가입하기' });
    await expect(logo).toBeVisible();
    await waitFor(() => {
      const image = logo.querySelector('img');
      expect(image?.naturalWidth).toBe(1024);
      expect(image?.naturalHeight).toBe(1024);
    });
    const logoBox = logo.getBoundingClientRect();
    const menuBox = navigation.getBoundingClientRect();
    expect(logoBox.width).toBe(48);
    expect(logoBox.height).toBe(48);
    expect(logoBox.left).toBeGreaterThanOrEqual(menuBox.left);
    expect(logoBox.right).toBeLessThanOrEqual(menuBox.right);
    expect(logoBox.bottom).toBeLessThanOrEqual(signup.getBoundingClientRect().top);
    signup.focus();
    await userEvent.tab();
    expect(menu.getByRole('link', { name: '로그인' })).toHaveFocus();
  },
};

export const InitialErrorRetry: Story = {
  ...initialErrorRetry,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const alert = await body.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await expect(
      canvas.findByText('로그인하지 않아도 로컬의 공개 이야기를 읽을 수 있어요.'),
    ).resolves.toBeVisible();
    await waitFor(() => expect(body.queryByRole('alert')).not.toBeInTheDocument());
    expect(canvas.queryByRole('tab', { name: '홈' })).not.toBeInTheDocument();
    expect(canvas.queryByRole('tab', { name: '로컬' })).not.toBeInTheDocument();
  },
};

export const MobileMenuAfterDismissal: Story = {
  ...mobile390,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.findByRole('heading', { name: '타임라인 둘러보기' })).resolves.toBeVisible();
    await userEvent.click(body.getByRole('button', { name: '가입 안내 닫기' }));
    const menu = body.getByRole('button', { name: '메뉴 열기' });
    menu.focus();
    await userEvent.keyboard('{Enter}');
    const drawer = within(await body.findByRole('dialog', { name: '메뉴' }));
    expect(drawer.getByLabelText('KOSMO 로고')).toBeVisible();
    const signup = drawer.getByRole('link', { name: '가입하기' });
    expect(signup).toHaveAttribute('href', '/login');
    signup.focus();
    await userEvent.tab();
    expect(drawer.getByRole('link', { name: '로그인' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(menu).toHaveFocus());
    expect(body.queryByRole('button', { name: '가입 안내 닫기' })).not.toBeInTheDocument();
  },
};
