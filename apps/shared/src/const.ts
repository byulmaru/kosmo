import { ProfileAccountRole } from './enums';

export const MAX_PROFILE_COUNT = 5;

export const PROFILE_ACCOUNT_ORDERED_ROLES = [
  ProfileAccountRole.OWNER,
  ProfileAccountRole.MEMBER,
] as const;
