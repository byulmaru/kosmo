import * as E from '@kosmo/enum';
import { pgEnum } from 'drizzle-orm/pg-core';

function createPgEnum<T extends string>(enumName: string, obj: Record<string, T>) {
  return pgEnum(enumName, Object.values(obj) as [T, ...T[]]);
}

export const AccountState = createPgEnum('_account_state', E.AccountState);
export const CryptographicKeyKind = createPgEnum('_cryptographic_key_kind', E.CryptographicKeyKind);
export const FileOwnership = createPgEnum('_file_ownership', E.FileOwnership);
export const InstanceType = createPgEnum('_instance_type', E.InstanceType);
export const ProfileAccountRole = createPgEnum('_profile_account_role', E.ProfileAccountRole);
export const ProfileFollowAcceptMode = createPgEnum(
  '_profile_follow_accept_mode',
  E.ProfileFollowAcceptMode,
);
export const ProfileState = createPgEnum('_profile_state', E.ProfileState);
