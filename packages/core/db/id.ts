import { ulid } from 'ulidx';
import type * as Tables from './tables';

export const TableCode = {
  Accounts: 'ACCT',
  AccountProfiles: 'ACPR',
  Applications: 'APPL',
  Posts: 'POST',
  PostContents: 'POCT',
  Profiles: 'PRFL',
  ProfileFollows: 'PFLW',
  Sessions: 'SESS',
} as const satisfies Record<keyof typeof Tables, Uppercase<string>>;

export const createId = (tableCode: (typeof TableCode)[keyof typeof TableCode]) =>
  `${tableCode}0${ulid()}`;
