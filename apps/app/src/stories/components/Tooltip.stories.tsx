import { cloneElement, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactElement } from 'react';

type TooltipStoryTriggerProps = { 'aria-describedby'?: string; onPress?: () => void };

function TooltipStoryTrigger({
  'aria-describedby': describedBy,
  onPress,
}: TooltipStoryTriggerProps) {
  return (
    <Button
      accessibilityLabel="미디어 미리보기 열기"
      aria-describedby={describedBy}
      onPress={onPress}
    >
      미리보기
    </Button>
  );
}

export function TooltipStoryFrame({
  atBottom = false,
  children,
  label,
}: {
  atBottom?: boolean;
  children: ReactElement<TooltipStoryTriggerProps>;
  label: string;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [opened, setOpened] = useState(false);
  return (
    <View style={[styles.frame, atBottom && { height, justifyContent: 'flex-end' }]}>
      <View style={styles.content}>
        <Tooltip label={label}>
          {cloneElement(children, { onPress: () => setOpened(true) })}
        </Tooltip>
        <Text
          id="tooltip-story-description"
          style={[textStyles.uiCopyS, { color: theme.foregroundSecondary }]}
        >
          {opened ? '미디어 미리보기가 열렸습니다.' : '선택하면 미디어 미리보기를 엽니다.'}
        </Text>
      </View>
    </View>
  );
}

const meta = {
  argTypes: { children: { control: false } },
  args: {
    children: <TooltipStoryTrigger aria-describedby="tooltip-story-description" />,
    label: '이 게시글에는 민감한 콘텐츠가 포함되어 있습니다.',
  },
  component: Tooltip,
  excludeStories: ['TooltipStoryFrame'],
  render: ({ children, label }) => <TooltipStoryFrame label={label}>{children}</TooltipStoryFrame>,
  title: 'KOSMO/Components/Tooltip',
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const NearBottom: Story = {
  render: ({ children, label }) => (
    <TooltipStoryFrame atBottom label={label}>
      {children}
    </TooltipStoryFrame>
  ),
};

const styles = StyleSheet.create({
  content: { alignItems: 'flex-start', gap: space[8] },
  frame: { padding: space[24] },
});
