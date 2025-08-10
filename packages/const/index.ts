import { ProfileAccountRole } from '@kosmo/enum';

export const SUPERAPP_APPLICATION_ID = 'APPL000WEB';
export const KOSMO_INSTANCE_ID = 'INST000KOSMO';

export const MAX_PROFILE_COUNT = 5;

export const PROFILE_ACCOUNT_ORDERED_ROLES = [
  ProfileAccountRole.OWNER,
  ProfileAccountRole.MEMBER,
] as const;
