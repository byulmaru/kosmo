import { fn } from 'storybook/test';
import { MobileWebRouteMenu } from '@/components/shell/MobileWebRouteMenu';
import { ShellChromeProvider } from '@/components/shell/ShellChromeContext';
import type { Meta, StoryObj } from '@storybook/react-vite';

export type MobileWebRouteMenuStoryArgs = {
  navigationDrawerOpen: boolean;
  onOpenNavigationDrawer: () => void;
};

function MenuStory({ navigationDrawerOpen, onOpenNavigationDrawer }: MobileWebRouteMenuStoryArgs) {
  return (
    <ShellChromeProvider
      navigationDrawerOpen={navigationDrawerOpen}
      openNavigationDrawer={onOpenNavigationDrawer}
      openProfileSwitcher={() => undefined}
      registerHomeReselection={() => () => undefined}
      reselectHome={() => undefined}
    >
      <MobileWebRouteMenu />
    </ShellChromeProvider>
  );
}

const meta = {
  args: {
    navigationDrawerOpen: false,
    onOpenNavigationDrawer: fn(),
  },
  argTypes: {
    navigationDrawerOpen: { control: 'boolean' },
    onOpenNavigationDrawer: { control: false },
  },
  component: MobileWebRouteMenu,
  parameters: { layout: 'fullscreen' },
  render: (args) => <MenuStory {...args} />,
  title: 'KOSMO/Patterns/Shell/Mobile Web Route Menu',
} satisfies Meta<MobileWebRouteMenuStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: {
    controls: {
      disable: false,
      include: ['navigationDrawerOpen'],
    },
  },
};

export const CompactPassThrough: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: { controls: { disable: true } },
};

export const FullPassThrough: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: { controls: { disable: true } },
};
