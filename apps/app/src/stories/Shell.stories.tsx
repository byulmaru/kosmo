import { View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { expect, userEvent, within } from 'storybook/test';
import { BottomTabBar } from '@/components/shell/BottomTabBar';
import { ProfileSwitcher } from '@/components/shell/ProfileSwitcher';
import { RightRail } from '@/components/shell/RightRail';
import { SidebarNavigation } from '@/components/shell/SidebarNavigation';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { spacing } from '@/theme/tokens';
import { profile, shellQuery } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ShellStoriesQuery as ShellStoriesQueryType } from './__generated__/ShellStoriesQuery.graphql';

const secondProfile = profile({
  displayName: '먼 우주의 사용자',
  handle: 'remote',
  id: 'profile-remote',
  relativeHandle: '@remote@space.example',
  viewerState: { follow: null, isSelf: true },
});
const query = shellQuery({ profiles: [profile(), secondProfile] });

const ShellStoriesQuery = graphql`
  query ShellStoriesQuery {
    ...ProfileSwitcher_query
    ...SidebarNavigation_query
    currentSession {
      selectedProfile {
        ...BottomTabBar_profile
        ...RightRail_profile
      }
    }
  }
`;

function useShellStoryData() {
  const data = useLazyLoadQuery<ShellStoriesQueryType>(ShellStoriesQuery, {});
  const profile = data.currentSession?.selectedProfile;
  if (!profile) {
    throw new Error('ShellStoriesQuery requires a selected profile fixture.');
  }
  return { profile, query: data };
}

function NavigationCatalog() {
  const data = useShellStoryData();

  return (
    <Catalog width={760}>
      <Section title="Sidebar · full">
        <View style={{ height: 620 }}>
          <SidebarNavigation query={data.query} />
        </View>
      </Section>
      <Section title="Right rail">
        <View style={{ padding: spacing.lg, width: 320 }}>
          <RightRail profile={data.profile} />
        </View>
      </Section>
    </Catalog>
  );
}

function BottomNavigationStory() {
  return <BottomTabBar profile={useShellStoryData().profile} />;
}

function CompactSidebarStory() {
  return (
    <View style={{ height: 560, width: 80 }}>
      <SidebarNavigation compact query={useShellStoryData().query} />
    </View>
  );
}

function ProfileSwitcherStory() {
  return (
    <View style={{ maxWidth: 360 }}>
      <ProfileSwitcher query={useShellStoryData().query} showAvatar={false} />
    </View>
  );
}

const meta = {
  component: NavigationCatalog,
  parameters: {
    relay: { data: query },
    router: { pathname: '/search' },
  },
  title: 'KOSMO/Shell/Navigation',
} satisfies Meta<typeof NavigationCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SharedNavigation: Story = {};

export const BottomNavigation: Story = { render: () => <BottomNavigationStory /> };

export const CompactSidebar: Story = { render: () => <CompactSidebarStory /> };

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
    const menu = await canvas.findByRole('menu', { name: '프로필 전환' });

    expect(menu).toBeVisible();
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(2);
    expect(canvas.queryByText('프로필 전환')).not.toBeInTheDocument();
    expect(canvas.queryByRole('dialog', { name: '프로필 전환' })).not.toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: '새 프로필 추가' }));
    expect(canvas.getByRole('form', { name: '새 프로필 만들기' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const reopenedMenu = await canvas.findByRole('menu', { name: '프로필 전환' });
    expect(within(reopenedMenu).queryByRole('form', { name: '새 프로필 만들기' })).toBeNull();
    expect(within(reopenedMenu).getByRole('menuitem', { name: '새 프로필 추가' })).toBeVisible();
  },
  render: () => <ProfileSwitcherStory />,
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
  play: async ({ canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView;
    let rail: HTMLElement | null = within(canvasElement).getByRole('navigation', {
      name: '주요 메뉴',
    });

    while (rail && view?.getComputedStyle(rail).position !== 'sticky') {
      rail = rail.parentElement;
    }

    expect(rail).not.toBeNull();
    expect(rail?.getBoundingClientRect().height).toBeLessThanOrEqual(view?.innerHeight ?? 0);
  },
  render: () => (
    <View style={{ height: 1800 }}>
      <UniversalShell />
    </View>
  ),
};
