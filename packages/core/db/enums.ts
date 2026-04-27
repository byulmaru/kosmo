import { pgEnum } from 'drizzle-orm/pg-core';
import * as Enum from '../enums';

const createPgEnum = <T extends string>(enumName: string, values: Record<T, T>) =>
  pgEnum(enumName, Object.values(values) as [T, ...T[]]);

export const accountProfileRole = createPgEnum('account_profile_role', Enum.AccountProfileRole);
export const accountState = createPgEnum('account_state', Enum.AccountState);
export const followPolicy = createPgEnum('follow_policy', Enum.FollowPolicy);
export const followState = createPgEnum('follow_state', Enum.FollowState);
export const postState = createPgEnum('post_state', Enum.PostState);
export const postVisibility = createPgEnum('post_visibility', Enum.PostVisibility);
export const sessionState = createPgEnum('session_state', Enum.SessionState);
