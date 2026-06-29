import { getContext, setContext } from 'svelte';
import type { PostComposer_profile$key, RightRail_profile$key } from '$mearie';

const TABS_LAYOUT_SESSION_KEY = Symbol('tabs-layout-session');

export type TabsLayoutSelectedProfile =
  | ({ id: string } & PostComposer_profile$key & RightRail_profile$key)
  | null;

type TabsLayoutSessionContext = {
  selectedProfile: () => TabsLayoutSelectedProfile;
  selectedProfileVersion: () => number;
  loading: () => boolean;
  error: () => boolean;
  refetch: () => unknown;
};

export function setTabsLayoutSessionContext(context: TabsLayoutSessionContext) {
  setContext(TABS_LAYOUT_SESSION_KEY, context);
}

export function getTabsLayoutSessionContext() {
  return getContext<TabsLayoutSessionContext | undefined>(TABS_LAYOUT_SESSION_KEY);
}
