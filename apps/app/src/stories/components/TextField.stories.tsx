import { StyleSheet, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TextArea, TextField } from '@/components/ui/TextField';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';

type TextFieldStoryArgs = ComponentProps<typeof TextField> & {
  containerWidth?: number;
};

const meta = {
  args: {
    editable: true,
    label: '이름',
    onBlur: fn(),
    onChangeText: fn(),
    onFocus: fn(),
    placeholder: '이름을 입력하세요',
  },
  component: TextField,
  excludeStories: ['TypingAndFocus'],
  parameters: { controls: { disable: true } },
  render: ({ containerWidth, ...args }: TextFieldStoryArgs) => (
    <View style={[styles.playground, { width: containerWidth }]}>
      <TextField key={args.defaultValue} {...args} />
    </View>
  ),
  title: 'KOSMO/Components/Text Field',
} satisfies Meta<TextFieldStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  args: {
    containerWidth: 480,
    defaultValue: '코스모',
    error: '입력값을 확인해 주세요.',
  },
  argTypes: {
    containerWidth: {
      control: { max: 720, min: 240, step: 40, type: 'range' },
      description: 'Storybook fixture width in pixels',
    },
  },
  parameters: {
    controls: {
      disable: false,
      include: ['containerWidth', 'defaultValue', 'editable', 'error', 'label', 'placeholder'],
    },
  },
};

export const TypingAndFocus: Story = {
  args: {
    containerWidth: 480,
    defaultValue: '코스모',
    editable: true,
    error: '입력값을 확인해 주세요.',
    label: '이름',
    placeholder: '이름을 입력하세요',
  },
  play: async ({ args, canvasElement, step }) => {
    args.onBlur?.mockClear();
    args.onChangeText?.mockClear();
    args.onFocus?.mockClear();
    const input = within(canvasElement).getByRole('textbox', { name: args.label ?? '이름' });

    if (args.editable === false) {
      await step('비활성 입력 계약 확인', async () => {
        expect(input).toHaveAttribute('readonly');
      });
      return;
    }

    await step('입력 포커스와 값 변경', async () => {
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, '코스모');
      expect(input).toHaveValue('코스모');
      expect(args.onFocus).toHaveBeenCalledOnce();
      expect(args.onChangeText).toHaveBeenLastCalledWith('코스모');
    });

    await step('포커스 이동과 blur callback', async () => {
      await userEvent.tab();
      expect(args.onBlur).toHaveBeenCalledOnce();
    });
  },
};

export const RepresentativeStates: Story = {
  render: () => (
    <View style={styles.catalog}>
      <TextField defaultValue="입력된 값" label="입력 완료" />
      <TextField error="입력값을 확인해 주세요." label="오류" value="잘못된 값" />
      <TextField editable={false} label="비활성" value="수정할 수 없는 값" />
      <TextArea label="여러 줄 입력" placeholder="본문을 입력하세요." />
    </View>
  ),
};

const styles = StyleSheet.create({
  catalog: { gap: space[16], maxWidth: 480 },
  playground: { maxWidth: '100%' },
});
