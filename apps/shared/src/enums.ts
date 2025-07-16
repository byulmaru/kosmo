export const AccountState = {
  ACTIVE: 'ACTIVE',
  DELETED: 'DELETED',
} as const;
export type AccountState = keyof typeof AccountState;

export const CryptographicKeyKind = {
  RSASSA_PKCS1_V1_5: 'RSASSA-PKCS1-v1_5',
  Ed25519: 'Ed25519',
} as const;
export type CryptographicKeyKind = keyof typeof CryptographicKeyKind;

export const FileOwnership = {
  LOCAL: 'LOCAL',
  REMOTE: 'REMOTE',
} as const;
export type FileOwnership = keyof typeof FileOwnership;

export const InstanceType = {
  LOCAL: 'LOCAL',
  ACTIVITYPUB: 'ACTIVITYPUB',
} as const;
export type InstanceType = keyof typeof InstanceType;

export const ProfileAccountRole = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const;
export type ProfileAccountRole = keyof typeof ProfileAccountRole;

export const ProfileState = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type ProfileState = keyof typeof ProfileState;
