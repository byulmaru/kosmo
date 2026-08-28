import { StyleSheet, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TextArea, TextField } from '@/components/ui/TextField';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

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
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Text Field',
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  parameters: { controls: { disable: false } },
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

export const TypingAndFocus: Story = {
  args: { defaultValue: '', error: '입력값을 확인해 주세요.', label: '이름' },
  play: async ({ args, canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: '이름' });

    await userEvent.click(input);
    await userEvent.type(input, '코스모');
    expect(input).toHaveValue('코스모');
    expect(args.onFocus).toHaveBeenCalled();
    expect(args.onChangeText).toHaveBeenLastCalledWith('코스모');

    await userEvent.tab();
    expect(args.onBlur).toHaveBeenCalled();
  },
};

const styles = StyleSheet.create({
  catalog: { gap: space[16], maxWidth: 480 },
});
