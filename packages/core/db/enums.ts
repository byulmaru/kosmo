import { pgEnum } from 'drizzle-orm/pg-core';
import * as Enum from '../enums';

const createPgEnum = <T extends string>(enumName: string, values: Record<T, T>) =>
  pgEnum(enumName, Object.values(values) as [T, ...T[]]);

export const accountProfileRole = createPgEnum('account_profile_role', Enum.AccountProfileRole);
export const accountState = createPgEnum('account_state', Enum.AccountState);
export const activityPubActorType = createPgEnum(
  'activitypub_actor_type',
  Enum.ActivityPubActorType,
);
export const activityPubActorKeyKind = createPgEnum(
  'activitypub_actor_key_kind',
  Enum.ActivityPubActorKeyKind,
);
export const activityPubObjectType = createPgEnum(
  'activitypub_object_type',
  Enum.ActivityPubObjectType,
);
export const applicationState = createPgEnum('application_state', Enum.ApplicationState);
export const applicationType = createPgEnum('application_type', Enum.ApplicationType);
export const instanceKind = createPgEnum('instance_kind', Enum.InstanceKind);
export const instanceState = createPgEnum('instance_state', Enum.InstanceState);
export const mediaSource = createPgEnum('media_source', Enum.MediaSource);
export const notificationKind = createPgEnum('notification_kind', Enum.NotificationKind);
export const oauthTokenState = createPgEnum('oauth_token_state', Enum.OAuthTokenState);
export const postState = createPgEnum('post_state', Enum.PostState);
export const postVisibility = createPgEnum('post_visibility', Enum.PostVisibility);
export const profileFollowPolicy = createPgEnum('profile_follow_policy', Enum.ProfileFollowPolicy);
export const profileState = createPgEnum('profile_state', Enum.ProfileState);
export const sessionState = createPgEnum('session_state', Enum.SessionState);
