import { pgEnum } from 'drizzle-orm/pg-core';
import * as Enum from '../enums';

const createPgEnum = <T extends string>(enumName: string, values: Record<T, T>) =>
  pgEnum(enumName, Object.values(values) as [T, ...T[]]);

export const accountProfileRole = createPgEnum('account_profile_role', Enum.AccountProfileRole);
export const accountState = createPgEnum('account_state', Enum.AccountState);
export const applicationState = createPgEnum('application_state', Enum.ApplicationState);
export const applicationType = createPgEnum('application_type', Enum.ApplicationType);
export const oauthTokenState = createPgEnum('oauth_token_state', Enum.OAuthTokenState);
export const postState = createPgEnum('post_state', Enum.PostState);
export const postVisibility = createPgEnum('post_visibility', Enum.PostVisibility);
export const profileFollowPolicy = createPgEnum('profile_follow_policy', Enum.ProfileFollowPolicy);
export const profileFollowState = createPgEnum('profile_follow_state', Enum.ProfileFollowState);
export const profileState = createPgEnum('profile_state', Enum.ProfileState);
export const sessionState = createPgEnum('session_state', Enum.SessionState);
