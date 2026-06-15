import { getContext, setContext } from 'svelte';

const PROFILE_SWITCHER_KEY = Symbol('profile-switcher');

type ProfileSwitcherContext = {
  // 사이드바 프로필 스위처(생성/선택)를 연다. 모바일에서는 드로어를 먼저 연다.
  openProfileSwitcher: () => void;
};

export const setProfileSwitcherContext = (context: ProfileSwitcherContext) =>
  setContext(PROFILE_SWITCHER_KEY, context);

export const getProfileSwitcherContext = () =>
  getContext<ProfileSwitcherContext | undefined>(PROFILE_SWITCHER_KEY);
