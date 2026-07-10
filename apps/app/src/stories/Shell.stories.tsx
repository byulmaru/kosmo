import { View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { BottomTabBar } from '@/components/shell/BottomTabBar';
import { ProfileSwitcher } from '@/components/shell/ProfileSwitcher';
import { RightRail } from '@/components/shell/RightRail';
import { SidebarNavigation } from '@/components/shell/SidebarNavigation';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { spacing } from '@/theme/tokens';
import { profile, shellQuery } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const secondProfile = profile({
  displayName: '먼 우주의 사용자',
  handle: 'remote',
  id: 'profile-remote',
  relativeHandle: '@remote@space.example',
  viewerState: { follow: null, isSelf: true },
});
const query = shellQuery({ profiles: [profile(), secondProfile] });

function NavigationCatalog() {
  return (
    <Catalog width={760}>
      <Section title="Bottom tab bar · active route and profile">
        <BottomTabBar profile={query.currentSession.selectedProfile as never} />
      </Section>
      <Section title="Sidebar · full">
        <View style={{ height: 620 }}>
          <SidebarNavigation query={query as never} />
        </View>
      </Section>
      <Section title="Sidebar · compact">
        <View style={{ height: 560, width: 80 }}>
          <SidebarNavigation compact query={query as never} />
        </View>
      </Section>
      <Section title="Right rail">
        <View style={{ padding: spacing.lg, width: 320 }}>
          <RightRail profile={query.currentSession.selectedProfile as never} />
        </View>
      </Section>
    </Catalog>
  );
}

const meta = {
  component: NavigationCatalog,
  parameters: { router: { pathname: '/search' } },
  title: 'KOSMO/Shell/Navigation',
} satisfies Meta<typeof NavigationCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SharedNavigation: Story = {};

export const ProfileSwitcherInteraction: Story = {
  parameters: {
    relay: {
      mutationResponse: {
        selectProfile: {
          profile: secondProfile,
          session: { selectedProfile: { id: secondProfile.id } },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const document = within(canvasElement.ownerDocument.body);
    await expect(document.findByText('프로필 전환')).resolves.toBeTruthy();
    await waitFor(() => {
      expect(document.getAllByRole('dialog', { name: '프로필 전환' })).toHaveLength(2);
    });
  },
  render: () => (
    <View style={{ maxWidth: 360 }}>
      <ProfileSwitcher query={query as never} />
    </View>
  ),
};

const universalParameters = {
  layout: 'fullscreen',
  relay: { data: query },
  router: { pathname: '/home', slotLabel: '홈 타임라인' },
};

export const UniversalMobile: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: universalParameters,
  render: () => (
    <View style={{ height: 844 }}>
      <UniversalShell />
    </View>
  ),
};

export const UniversalCompact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: universalParameters,
  render: () => (
    <View style={{ height: 900 }}>
      <UniversalShell />
    </View>
  ),
};

export const UniversalFull: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: universalParameters,
  render: () => (
    <View style={{ height: 900 }}>
      <UniversalShell />
    </View>
  ),
};
