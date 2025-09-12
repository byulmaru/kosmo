import { ulid } from 'ulidx';
import * as T from './tables';

export const TableCode = {
  Accounts: 'ACNT',
  Applications: 'APPL',
  ApplicationGrants: 'APGR',
  ApplicationGrantProfiles: 'APGP',
  ApplicationRedirectUris: 'APRU',
  ApplicationSecrets: 'APPS',
  Files: 'FILE',
  Instances: 'INST',
  Posts: 'POST',
  PostMentions: 'PSTM',
  Profiles: 'PRFL',
  ProfileAccounts: 'PFAC',
  ProfileCryptographicKeys: 'PFCK',
  ProfileFollows: 'PFFL',
  ProfileFollowRequests: 'PFFR',
  Sessions: 'SESN',
} as const satisfies Record<keyof typeof T, Uppercase<string>>;

export const createDbId = (tableCode: string) => {
  return `${tableCode}0${ulid()}`;
};

export const decodeDbId = (id: string) => {
  return id.split('0', 2)[0];
};
