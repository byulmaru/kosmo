import { StyleSheet, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { StateView } from '@/components/ui/StateView';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: {
    alert: false,
    description: '현재 상태를 확인해 주세요.',
    loading: false,
    onAction: fn(),
    title: '상태 안내',
  },
  component: StateView,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/State View',
} satisfies Meta<typeof StateView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  args: { actionLabel: '다시 시도' },
  parameters: { controls: { disable: false } },
};

export const RepresentativeStates: Story = {
  render: () => (
    <View style={styles.catalog}>
      <StateView loading title="불러오는 중입니다." />
      <StateView description="첫 항목이 생기면 여기에 표시돼요." title="아직 항목이 없어요" />
      <StateView
        actionLabel="다시 시도"
        alert
        description="잠시 후 다시 시도해 주세요."
        onAction={() => undefined}
        title="불러오지 못했어요"
      />
    </View>
  ),
};

export const ActionInteraction: Story = {
  args: {
    actionLabel: '다시 시도',
    alert: true,
    description: '잠시 후 다시 시도해 주세요.',
    title: '불러오지 못했어요',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('alert')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    expect(args.onAction).toHaveBeenCalledOnce();
  },
};

export const ReducedMotionLoading: Story = {
  args: { description: undefined, loading: true, title: '불러오는 중입니다.' },
  globals: { reduceMotion: true },
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByText('···')).toBeVisible();
  },
};

const styles = StyleSheet.create({
  catalog: { gap: space[16] },
});
