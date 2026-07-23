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

export const ActivityPubActorType = {
  APPLICATION: 'APPLICATION',
  GROUP: 'GROUP',
  ORGANIZATION: 'ORGANIZATION',
  PERSON: 'PERSON',
  SERVICE: 'SERVICE',
} as const;
export type ActivityPubActorType = keyof typeof ActivityPubActorType;

export const ActivityPubActorKeyKind = {
  RSA_PKCS1_V1_5: 'RSA_PKCS1_V1_5',
  ED25519: 'ED25519',
} as const;
export type ActivityPubActorKeyKind = keyof typeof ActivityPubActorKeyKind;

export const ApplicationState = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type ApplicationState = keyof typeof ApplicationState;

export const ApplicationType = {
  CONFIDENTIAL: 'CONFIDENTIAL',
  PUBLIC: 'PUBLIC',
} as const;
export type ApplicationType = keyof typeof ApplicationType;

export const InstanceKind = {
  LOCAL: 'LOCAL',
  ACTIVITYPUB: 'ACTIVITYPUB',
} as const;
export type InstanceKind = keyof typeof InstanceKind;

export const InstanceState = {
  ACTIVE: 'ACTIVE',
  UNRESPONSIVE: 'UNRESPONSIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type InstanceState = keyof typeof InstanceState;

export const MediaSource = {
  LOCAL: 'LOCAL',
  REMOTE: 'REMOTE',
} as const;
export type MediaSource = keyof typeof MediaSource;

export const NotificationKind = {
  FOLLOW: 'FOLLOW',
  REACTION: 'REACTION',
} as const;
export type NotificationKind = keyof typeof NotificationKind;

export const OAuthTokenState = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
} as const;
export type OAuthTokenState = keyof typeof OAuthTokenState;

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

export const ProfileFollowPolicy = {
  OPEN: 'OPEN',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
} as const;
export type ProfileFollowPolicy = keyof typeof ProfileFollowPolicy;

export const ProfileState = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type ProfileState = keyof typeof ProfileState;

export const SessionState = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
} as const;
export type SessionState = keyof typeof SessionState;
