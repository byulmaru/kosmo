import { View } from 'react-native';
import { RightRailFooter } from '@/components/shell/RightRail';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, spacing } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: RightRailFooter,
  title: 'KOSMO/Patterns/Shell/RightRailFooter',
} satisfies Meta<typeof RightRailFooter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => <RailFooterPreview />,
};

function RailFooterPreview() {
  const theme = useTheme();

  return (
    <View
      style={{
        borderColor: theme.borderSubtle,
        borderLeftWidth: borderWidths[1],
        paddingTop: spacing.lg,
        width: 320,
      }}
    >
      <RightRailFooter />
    </View>
  );
}
