import { View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { MobileWebRouteChrome } from '@/components/shell/MobileWebRouteChrome';
import type { Meta, StoryObj } from '@storybook/react-vite';

function ChromeStory() {
  return (
    <View style={{ minHeight: 1200, width: '100%' }}>
      <MobileWebRouteChrome>
        <PageHeader accessibilityLabel="홈" variant="brand" />
      </MobileWebRouteChrome>
    </View>
  );
}

const meta = {
  component: MobileWebRouteChrome,
  parameters: { layout: 'fullscreen' },
  title: 'KOSMO/Patterns/Shell/Mobile Web Route Chrome',
} satisfies Meta<typeof MobileWebRouteChrome>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  render: () => <ChromeStory />,
};

export const CompactPassThrough: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  render: () => <ChromeStory />,
};

export const FullPassThrough: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  render: () => <ChromeStory />,
};
