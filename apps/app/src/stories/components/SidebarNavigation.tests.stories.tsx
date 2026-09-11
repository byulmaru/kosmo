import baseMeta, {
  CompactInteractionContract as compactInteractionContract,
  CompactLogoutLifecycleContract as compactLogoutLifecycleContract,
  CompactLogoutPendingContract as compactLogoutPendingContract,
  DrawerInteractionContract as drawerInteractionContract,
  DrawerLogoutLifecycleContract as drawerLogoutLifecycleContract,
  FeedbackUnavailableContract as feedbackUnavailableContract,
  InteractionContract as interactionContract,
  LogoutErrorContract as logoutErrorContract,
  LogoutLifecycleContract as logoutLifecycleContract,
  LogoutPendingContract as logoutPendingContract,
  NarrowDrawerLayoutContract as narrowDrawerLayoutContract,
  PresentationTransitionContract as presentationTransitionContract,
  ProfileUnavailableContract as profileUnavailableContract,
  ReducedMotionContract as reducedMotionContract,
  SettingsNavigationDisclosure as settingsNavigationDisclosure,
  SettingsNavigationDisclosureDrawer as settingsNavigationDisclosureDrawer,
} from './SidebarNavigation.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Sidebar Navigation/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
export const CompactInteractionContract: Story = compactInteractionContract;
export const CompactLogoutLifecycleContract: Story = compactLogoutLifecycleContract;
export const CompactLogoutPendingContract: Story = compactLogoutPendingContract;
export const DrawerInteractionContract: Story = drawerInteractionContract;
export const DrawerLogoutLifecycleContract: Story = drawerLogoutLifecycleContract;
export const FeedbackUnavailableContract: Story = feedbackUnavailableContract;
export const LogoutPendingContract: Story = logoutPendingContract;
export const LogoutErrorContract: Story = logoutErrorContract;
export const LogoutLifecycleContract: Story = logoutLifecycleContract;
export const NarrowDrawerLayoutContract: Story = narrowDrawerLayoutContract;
export const ProfileUnavailableContract: Story = profileUnavailableContract;
export const PresentationTransitionContract: Story = presentationTransitionContract;
export const SettingsNavigationDisclosure: Story = settingsNavigationDisclosure;
export const SettingsNavigationDisclosureDrawer: Story = settingsNavigationDisclosureDrawer;
