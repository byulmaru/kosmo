import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useArgs } from 'storybook/preview-api';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PostContentWarning } from '@/components/post/PostContentWarning';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentType } from 'react';
import type { PostContentWarningProps } from '@/components/post/PostContentWarning';

type CatalogProps = PostContentWarningProps & { containerWidth: number };
export type PostContentWarningStoryArgs = CatalogProps;
type PostContentWarningCatalogProps = CatalogProps & {
  updateArgs?: (update: Partial<Pick<PostContentWarningStoryArgs, 'revealed'>>) => void;
};
type InteractiveWarningProps = PostContentWarningProps & {
  updateArgs?: PostContentWarningCatalogProps['updateArgs'];
};

const meta = {
  args: {
    containerWidth: 524,
    imageCount: 2,
    onPress: fn(),
    revealed: false,
    summary: '민감한 내용이 포함되어 있습니다.',
  },
  argTypes: {
    containerWidth: { control: 'inline-radio', options: [314, 524] },
    imageCount: { control: { max: 4, min: 0, step: 1, type: 'number' } },
    onPress: { action: 'press', control: false },
    revealed: { control: 'boolean' },
    summary: { control: 'text' },
  },
  component: PostContentWarning as unknown as ComponentType<CatalogProps>,
  excludeStories: ['InteractionContract'],
  parameters: { layout: 'centered' },
  render: (args) => <PostContentWarningCatalog {...args} />,
  title: 'KOSMO/Components/Post Content Warning',
} satisfies Meta<CatalogProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => {
    const [, updateArgs] = useArgs<PostContentWarningStoryArgs>();
    return <PostContentWarningCatalog {...args} updateArgs={updateArgs} />;
  },
};

export const Revealed: Story = { args: { revealed: true } };

export const Text: Story = { args: { imageCount: null } };

export const LongSummary: Story = {
  args: {
    summary:
      '스포일러와 민감한 내용이 포함되어 있습니다. 내용을 확인하기 전에 가림을 해제해 주세요.',
  },
  parameters: { layout: 'padded' },
};

export const Mobile: Story = {
  args: { containerWidth: 314 },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
};

export const InteractionContract: Story = {
  args: { containerWidth: 524, imageCount: 2, revealed: false },
  parameters: { controls: { disable: true } },
  render: ({ containerWidth, ...props }) => (
    <View style={{ maxWidth: '100%', width: containerWidth }}>
      <InteractiveWarning {...props} />
    </View>
  ),
  play: async ({ args, canvasElement }) => {
    args.onPress.mockClear();
    const canvas = within(canvasElement);
    const warning = canvas.getByRole('button', {
      name: `${args.summary}, 본문 · 이미지 ${args.imageCount}개, 보기`,
    });

    expect(warning).not.toHaveAttribute('aria-pressed');
    expect(warning).toHaveAttribute('aria-expanded', 'false');
    expect(warning.getBoundingClientRect().height).toBeGreaterThanOrEqual(56);
    await userEvent.tab();
    expect(warning).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(args.onPress).toHaveBeenCalledOnce();
    expect(warning).toHaveAttribute('aria-expanded', 'true');
    expect(warning).toHaveAccessibleName(
      `${args.summary}, 본문 · 이미지 ${args.imageCount}개, 다시 가리기`,
    );
    await userEvent.keyboard(' ');
    expect(args.onPress).toHaveBeenCalledTimes(2);
    expect(warning).toHaveAttribute('aria-expanded', 'false');
  },
};

function PostContentWarningCatalog({
  containerWidth,
  updateArgs,
  ...props
}: PostContentWarningCatalogProps) {
  return (
    <View style={{ maxWidth: '100%', width: containerWidth }}>
      <InteractiveWarning {...props} updateArgs={updateArgs} />
    </View>
  );
}

function InteractiveWarning({ updateArgs, ...props }: InteractiveWarningProps) {
  const [revealed, setRevealed] = useState(props.revealed);

  useEffect(() => setRevealed(props.revealed), [props.revealed]);

  return (
    <PostContentWarning
      {...props}
      onPress={() => {
        props.onPress();
        const nextRevealed = !revealed;
        setRevealed(nextRevealed);
        updateArgs?.({ revealed: nextRevealed });
      }}
      revealed={revealed}
    />
  );
}
