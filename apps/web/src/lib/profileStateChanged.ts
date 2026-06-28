import type { DataOf } from '@mearie/core';
import type { ProfileSwitcherSelectProfileMutation } from '$mearie';

export type ProfileStateChangedReason = 'profile-selected' | 'profile-created';

type SelectProfileData = DataOf<ProfileSwitcherSelectProfileMutation>;

export type ProfileStateChangedSelectedProfile =
  SelectProfileData['selectProfile']['session']['selectedProfile'];
