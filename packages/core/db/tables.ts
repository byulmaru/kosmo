import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import * as Enum from './enums';
import { createId, TableDiscriminator } from './id';
import { datetime } from './types';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { PostContentDocumentV1 } from '../post-content';

type JsonWebKeyRecord = Record<string, unknown>;

const createdAt = () =>
  datetime('created_at')
    .notNull()
    .default(sql`now()`);

const updatedAt = () =>
  datetime('updated_at')
    .notNull()
    .default(sql`now()`);

export const Accounts = pgTable('account', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => createId(TableDiscriminator.Accounts)),
  oidcSubject: text('oidc_subject').unique().notNull(),
  displayName: text('display_name').notNull(),
  state: Enum.accountState('state').notNull(),
  createdAt: createdAt(),
});

export const AccountProfiles = pgTable(
  'account_profile',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.AccountProfiles)),
    accountId: uuid('account_id')
      .notNull()
      .references(() => Accounts.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    role: Enum.accountProfileRole('role').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.accountId, table.profileId),
    index().on(table.accountId),
    index().on(table.profileId),
  ],
);

export const ActivityPubActors = pgTable(
  'activitypub_actor',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.ActivityPubActors)),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    uri: text('uri').unique().notNull(),
    type: Enum.activityPubActorType('type').notNull(),
    inboxUri: text('inbox_uri'),
    outboxUri: text('outbox_uri'),
    followersUri: text('followers_uri'),
    followingUri: text('following_uri'),
    sharedInboxUri: text('shared_inbox_uri'),
    lastFetchedAt: datetime('last_fetched_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.profileId)],
);

export const ActivityPubActorKeys = pgTable(
  'activitypub_actor_key',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.ActivityPubActorKeys)),
    activityPubActorId: uuid('activitypub_actor_id')
      .notNull()
      .references(() => ActivityPubActors.id, { onDelete: 'cascade' }),
    kind: Enum.activityPubActorKeyKind('kind').notNull(),
    publicKeyJwk: jsonb('public_key_jwk').$type<JsonWebKeyRecord>().notNull(),
    privateKeyJwk: jsonb('private_key_jwk').$type<JsonWebKeyRecord>(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.activityPubActorId, table.kind)],
);

export const Applications = pgTable(
  'application',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.Applications)),
    ownerAccountId: uuid('owner_account_id').references(() => Accounts.id, {
      onDelete: 'set null',
    }),
    clientId: text('client_id').notNull(),
    clientSecretHash: text('client_secret_hash'),
    name: text('name').notNull(),
    redirectUris: text('redirect_uris').array().notNull(),
    scopes: text('scopes').array().notNull(),
    type: Enum.applicationType('type').notNull(),
    state: Enum.applicationState('state').notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.clientId), index().on(table.ownerAccountId)],
);

export const ApplicationAuthorizations = pgTable(
  'application_authorization',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.ApplicationAuthorizations)),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => Applications.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => Accounts.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => Profiles.id, { onDelete: 'set null' }),
    scopes: text('scopes').array().notNull(),
    createdAt: createdAt(),
    revokedAt: datetime('revoked_at'),
  },
  (table) => [
    unique().on(table.applicationId, table.accountId, table.profileId),
    index().on(table.accountId),
    index().on(table.applicationId),
  ],
);

export const Files = pgTable('file', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => createId(TableDiscriminator.Files)),
  storageKey: text('storage_key').unique().notNull(),
  sha256: text('sha256'),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size'),
  width: integer('width'),
  height: integer('height'),
  createdAt: createdAt(),
});

export const Instances = pgTable(
  'instance',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.Instances)),
    domain: text('domain').unique().notNull(),
    canonicalOrigin: text('canonical_origin'),
    kind: Enum.instanceKind('kind').notNull(),
    state: Enum.instanceState('state').notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index().on(table.kind, table.state)],
);

export const Media = pgTable(
  'media',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.Media)),
    source: Enum.mediaSource('source').notNull(),
    accountId: uuid('account_id').references(() => Accounts.id),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id),
    originalFileId: uuid('original_file_id').references(() => Files.id),
    thumbnailFileId: uuid('thumbnail_file_id').references(() => Files.id),
    remoteUrl: text('remote_url'),
    remoteFetchedAt: datetime('remote_fetched_at'),
    thumbhash: text('thumbhash'),
    createdAt: createdAt(),
  },
  (table) => [
    index().on(table.accountId),
    index().on(table.profileId),
    index().on(table.remoteUrl),
  ],
);

export const Notifications = pgTable(
  'notification',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.Notifications)),
    recipientProfileId: uuid('recipient_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    kind: Enum.notificationKind('kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    data: jsonb('data').$type<Record<string, never>>().notNull().default({}),
    createdAt: createdAt(),
    readAt: datetime('read_at'),
  },
  (table) => [
    unique().on(table.recipientProfileId, table.kind, table.sourceId),
    index().on(table.recipientProfileId, table.id),
    index()
      .on(table.recipientProfileId)
      .where(sql`${table.readAt} IS NULL`),
  ],
);

export const OAuthAuthorizationCodes = pgTable(
  'oauth_authorization_code',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.OAuthAuthorizationCodes)),
    codeHash: text('code_hash').notNull(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => Applications.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => Accounts.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => Profiles.id, { onDelete: 'set null' }),
    redirectUri: text('redirect_uri').notNull(),
    scopes: text('scopes').array().notNull(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull(),
    createdAt: createdAt(),
    expiresAt: datetime('expires_at').notNull(),
    consumedAt: datetime('consumed_at'),
  },
  (table) => [
    unique().on(table.codeHash),
    index().on(table.applicationId),
    index().on(table.expiresAt),
  ],
);

export const OAuthTokens = pgTable(
  'oauth_token',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.OAuthTokens)),
    accessTokenHash: text('access_token_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash'),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => Applications.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => Accounts.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => Profiles.id, { onDelete: 'set null' }),
    scopes: text('scopes').array().notNull(),
    state: Enum.oauthTokenState('state').notNull(),
    issuedAt: datetime('issued_at').notNull(),
    lastUsedAt: datetime('last_used_at').notNull(),
    expiresAt: datetime('expires_at').notNull(),
    revokedAt: datetime('revoked_at'),
  },
  (table) => [
    unique().on(table.accessTokenHash),
    unique().on(table.refreshTokenHash),
    index().on(table.accountId),
    index().on(table.applicationId),
    index().on(table.state, table.expiresAt),
  ],
);

export const Posts = pgTable(
  'post',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.Posts)),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id),
    visibility: Enum.postVisibility('visibility').notNull(),
    state: Enum.postState('state').notNull(),
    currentContentId: uuid('current_content_id').references((): AnyPgColumn => PostContents.id),
    createdAt: createdAt(),
    deletedAt: datetime('deleted_at'),
  },
  (table) => [index().on(table.profileId, table.id.desc())],
);

export const PostContents = pgTable(
  'post_content',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.PostContents)),
    postId: uuid('post_id')
      .notNull()
      .references((): AnyPgColumn => Posts.id),
    document: jsonb('document').$type<PostContentDocumentV1>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.postId)],
);

export const Profiles = pgTable(
  'profile',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.Profiles)),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => Instances.id),
    state: Enum.profileState('state').notNull().default('ACTIVE'),
    handle: text('handle').notNull(),
    normalizedHandle: text('normalized_handle').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    followPolicy: Enum.profileFollowPolicy('follow_policy').notNull(),
    followersCount: integer('followers_count').notNull().default(0),
    followingCount: integer('following_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.instanceId, table.normalizedHandle)],
);

export const ProfileFollows = pgTable(
  'profile_follow',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.ProfileFollows)),
    followerProfileId: uuid('follower_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    followeeProfileId: uuid('followee_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.followerProfileId, table.followeeProfileId),
    index().on(table.followeeProfileId),
    index().on(table.followerProfileId),
  ],
);

export const ProfileFollowRequests = pgTable(
  'profile_follow_request',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.ProfileFollowRequests)),
    followerProfileId: uuid('follower_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    followeeProfileId: uuid('followee_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.followerProfileId, table.followeeProfileId),
    index().on(table.followeeProfileId),
    index().on(table.followerProfileId),
  ],
);

export const Sessions = pgTable(
  'session',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.Sessions)),
    accountId: uuid('account_id')
      .notNull()
      .references(() => Accounts.id),
    applicationId: uuid('application_id').references(() => Applications.id),
    activeProfileId: uuid('active_profile_id').references(() => Profiles.id),
    oidcSessionKey: text('oidc_session_key'),
    token: text('token').unique().notNull(),
    state: Enum.sessionState('state').notNull(),
    issuedAt: datetime('issued_at')
      .notNull()
      .default(sql`now()`),
    lastUsedAt: datetime('last_used_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index().on(table.accountId)],
);
