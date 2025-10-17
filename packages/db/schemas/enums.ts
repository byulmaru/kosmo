import * as E from '@kosmo/enum';
import { pgEnum } from 'drizzle-orm/pg-core';

function createPgEnum<T extends string>(enumName: string, obj: Record<string, T>) {
  return pgEnum(enumName, Object.values(obj) as [T, ...T[]]);
}

export const AccountState = createPgEnum('_account_state', E.AccountState);
export const CryptographicKeyKind = createPgEnum('_cryptographic_key_kind', E.CryptographicKeyKind);
export const FileOwnership = createPgEnum('_file_ownership', E.FileOwnership);
export const FileState = createPgEnum('_file_state', E.FileState);
export const InstanceType = createPgEnum('_instance_type', E.InstanceType);
export const NotificationKind = createPgEnum('_notification_kind', E.NotificationKind);
export const NotificationState = createPgEnum('_notification_state', E.NotificationState);
export const NotificationTargetKind = createPgEnum(
  '_notification_target_kind',
  E.NotificationTargetKind,
);
export const PostSnapshotState = createPgEnum('_post_snapshot_state', E.PostSnapshotState);
export const PostState = createPgEnum('_post_state', E.PostState);
export const PostVisibility = createPgEnum('_post_visibility', E.PostVisibility);
export const ProfileAccountRole = createPgEnum('_profile_account_role', E.ProfileAccountRole);
export const ProfileFollowAcceptMode = createPgEnum(
  '_profile_follow_accept_mode',
  E.ProfileFollowAcceptMode,
);
export const ProfileProtocol = createPgEnum('_profile_protocol', E.ProfileProtocol);
export const ProfileRelationVisibility = createPgEnum(
  '_profile_relation_visibility',
  E.ProfileRelationVisibility,
);
export const ProfileState = createPgEnum('_profile_state', E.ProfileState);
