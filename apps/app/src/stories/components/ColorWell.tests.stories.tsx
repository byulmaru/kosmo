import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  InteractionContract as interactionContract,
  Playground as playground,
} from './ColorWell.stories';
import type { StoryObj } from '@storybook/react-vite';

type Story = StoryObj<typeof baseMeta>;

export default {
  ...baseMeta,
  excludeStories: [],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Color Well/Tests',
};

export const InteractionContract = interactionContract;
export const DarkInteractionContract = { ...interactionContract, globals: { theme: 'dark' } };
export const PlaygroundInteractionContract: Story = {
  ...playground,
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    args.onPress.mockClear();
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: '강조 색상: #4684C2' }));
    expect(canvas.getByRole('heading', { name: '강조 색상 선택' })).toBeVisible();
    await userEvent.clear(canvas.getByRole('textbox', { name: 'HEX 색상' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'HEX 색상' }), '#123456');
    await userEvent.click(canvas.getByRole('button', { name: '적용' }));

    expect(canvas.getByRole('button', { name: '강조 색상: #123456' })).toBeVisible();
    expect(canvas.queryByRole('heading', { name: '강조 색상 선택' })).not.toBeInTheDocument();
    expect(args.onPress).toHaveBeenCalledOnce();
  },
};
