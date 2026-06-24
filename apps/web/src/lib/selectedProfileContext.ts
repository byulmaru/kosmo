import { getContext, setContext } from 'svelte';
import type { PostComposer_profile$key, RightRail_profile$key } from '$mearie';

const SELECTED_PROFILE_KEY = Symbol('selected-profile');

export type SelectedProfileOverride = {
  id: string;
  handle: string;
  displayName: string;
  followingCount: number;
  followersCount: number;
} & PostComposer_profile$key &
  RightRail_profile$key;

type SelectedProfileContext = {
  selectedProfile: () => SelectedProfileOverride | null;
};

export const setSelectedProfileContext = (context: SelectedProfileContext) =>
  setContext(SELECTED_PROFILE_KEY, context);

export const getSelectedProfileContext = () =>
  getContext<SelectedProfileContext | undefined>(SELECTED_PROFILE_KEY);
