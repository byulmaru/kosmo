import { expect, userEvent, within } from 'storybook/test';
import meta from './FirstProfileDiscoveryFlow.stories';
import type { StoryObj } from '@storybook/react-vite';

export default {
  ...meta,
  parameters: { ...meta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/First Profile Discovery Flow/Tests',
};
type Story = StoryObj<typeof meta>;

export const HandleOnlyStartsHome: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const handle = await canvas.findByRole('textbox', { name: '핸들' });
    await userEvent.type(handle, 'spring');
    await userEvent.click(canvas.getByRole('button', { name: '바로 시작' }));
    await expect(await canvas.findByRole('heading', { name: '홈' })).toBeVisible();
  },
};
