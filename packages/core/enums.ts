export const AccountProfileRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type AccountProfileRole = keyof typeof AccountProfileRole;

export const AccountState = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type AccountState = keyof typeof AccountState;

export const FollowPolicy = {
  OPEN: 'OPEN',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
} as const;
export type FollowPolicy = keyof typeof FollowPolicy;

export const FollowState = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
} as const;
export type FollowState = keyof typeof FollowState;

export const PostState = {
  ACTIVE: 'ACTIVE',
  DELETED: 'DELETED',
} as const;
export type PostState = keyof typeof PostState;

export const PostVisibility = {
  PUBLIC: 'PUBLIC',
  UNLISTED: 'UNLISTED',
  FOLLOWERS: 'FOLLOWERS',
  DIRECT: 'DIRECT',
} as const;
export type PostVisibility = keyof typeof PostVisibility;

export const SessionState = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
} as const;
export type SessionState = keyof typeof SessionState;
