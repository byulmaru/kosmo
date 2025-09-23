import { ProfileAccountRole } from '@kosmo/enum';

export const AVATAR_FILE_ID = 'FILE000AVATAR';
export const SUPERAPP_APPLICATION_ID = 'APPL000WEB';
export const KOSMO_INSTANCE_ID = 'INST000KOSMO';

export const MAX_PROFILE_COUNT = 5;

export const PROFILE_ACCOUNT_ORDERED_ROLES = [
  ProfileAccountRole.OWNER,
  ProfileAccountRole.MEMBER,
] as const;

export const TIMELINE_MAX_COUNT = 1000;
export const TIMELINE_REPOST_FALLOFF = 50;
