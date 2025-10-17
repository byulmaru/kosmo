import {
  AccountState,
  NotificationState,
  PostSnapshotState,
  PostState,
  PostVisibility,
  ProfileFollowAcceptMode,
  ProfileRelationVisibility,
  ProfileState,
} from '@kosmo/enum';
import { eq, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  json,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import * as E from './enums';
import { createDbId, TableCode } from './id';
import { datetime } from './types';
import type { LANGUAGE_LIST } from '@kosmo/i18n';
import type { Scope } from '@kosmo/type';
import type { JSONContent } from '@tiptap/core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

export const Accounts = pgTable(
  'accounts',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.Accounts)),
    providerAccountId: varchar('provider_account_id').notNull(),
    providerSessionToken: varchar('provider_session_token').notNull(),
    name: varchar('name').notNull(),
    state: E.AccountState('state').notNull().default(AccountState.ACTIVE),
    languages: json('languages').$type<LANGUAGE_LIST[]>().notNull(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex('provider_account_id_unique')
      .on(table.providerAccountId)
      .where(eq(table.state, sql`'ACTIVE'`)),
  ],
);

export const AccountProfileMemos = pgTable('account_profile_memos', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.AccountProfileMemos)),
  accountId: varchar('account_id').notNull(),
  profileId: varchar('profile_id').notNull(),
  content: varchar('content').notNull(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

export const AccountProfileMutes = pgTable(
  'account_profile_mutes',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.AccountProfileMutes)),
    accountId: varchar('account_id').notNull(),
    profileId: varchar('profile_id').notNull(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.accountId, t.profileId)],
);

export const Applications = pgTable('applications', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.Applications)),
  name: varchar('name').notNull(),
  description: text('description'),
  websiteUrl: varchar('website_url'),
  iconFileId: varchar('icon_file_id').references(() => Files.id),
  scopes: json('scopes').$type<Scope[]>(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

export const ApplicationGrants = pgTable(
  'application_grants',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.ApplicationGrants)),
    applicationId: varchar('application_id')
      .notNull()
      .references(() => Applications.id),
    accountId: varchar('account_id')
      .notNull()
      .references(() => Accounts.id),
    scopes: json('scopes').$type<Scope[]>(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [uniqueIndex().on(t.accountId, t.applicationId)],
);

export const ApplicationGrantProfiles = pgTable(
  'application_grant_profiles',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.ApplicationGrantProfiles)),
    applicationGrantId: varchar('application_grant_id')
      .notNull()
      .references(() => ApplicationGrants.id),
    profileId: varchar('profile_id').references(() => Profiles.id),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.applicationGrantId, t.profileId).nullsNotDistinct()],
);

export const ApplicationRedirectUris = pgTable('application_redirect_uris', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.ApplicationRedirectUris)),
  applicationId: varchar('application_id')
    .notNull()
    .references(() => Applications.id),
  uri: varchar('uri').notNull(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

export const ApplicationSecrets = pgTable('application_secrets', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.ApplicationSecrets)),
  applicationId: varchar('application_id')
    .notNull()
    .references(() => Applications.id),
  secret: varchar('secret').notNull(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

export const Files = pgTable('files', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.Files)),
  accountId: varchar('account_id').references(() => Accounts.id),
  state: E.FileState('state').notNull(),
  ownership: E.FileOwnership('ownership').notNull(),
  path: varchar('path').notNull(),
  placeholder: varchar('placeholder'),
  transform: jsonb('transform').$type<{ width?: number; height?: number; lossless?: boolean }>(),
  metadata: jsonb('metadata'),
  size: integer('size'),
  processed: boolean('processed').default(false),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
  expiresAt: datetime('expires_at'),
});

export const Instances = pgTable('instances', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.Instances)),
  domain: varchar('domain').notNull().unique(),
  webDomain: varchar('web_domain').unique(),
  type: E.InstanceType('type').notNull(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

export const Notifications = pgTable(
  'notifications',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.Notifications)),
    targetId: varchar('target_id').notNull(),
    targetKind: E.NotificationTargetKind('target_kind').notNull(),
    actorId: varchar('actor_id').references(() => Profiles.id),
    objectId: varchar('object_id'),
    state: E.NotificationState('state').notNull().default(NotificationState.UNREAD),
    kind: E.NotificationKind('kind').notNull(),
    data: jsonb('data').notNull().default({}),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index().on(t.targetKind, t.targetId), index().on(t.kind, t.objectId, t.createdAt)],
);

export const Posts = pgTable('posts', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.Posts)),
  profileId: varchar('profile_id')
    .notNull()
    .references(() => Profiles.id),
  state: E.PostState('state').notNull().default(PostState.ACTIVE),
  visibility: E.PostVisibility('visibility').notNull(),
  replyToPostId: varchar('reply_to_post_id').references((): AnyPgColumn => Posts.id),
  repostOfPostId: varchar('repost_of_post_id').references((): AnyPgColumn => Posts.id),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
  updatedAt: datetime('updated_at'),
  deletedAt: datetime('deleted_at'),
});

export const PostSnapshots = pgTable(
  'post_snapshots',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.PostSnapshots)),
    postId: varchar('post_id')
      .notNull()
      .references(() => Posts.id),
    state: E.PostSnapshotState('state').notNull().default(PostSnapshotState.ACTIVE),
    content: jsonb('content').notNull().$type<JSONContent>(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex()
      .on(t.postId)
      .where(eq(t.state, sql`'ACTIVE'`)),
  ],
);

export const PostMentions = pgTable('post_mentions', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.PostMentions)),
  postId: varchar('post_id')
    .notNull()
    .references(() => Posts.id),
  profileId: varchar('profile_id')
    .notNull()
    .references(() => Profiles.id),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

export const Profiles = pgTable(
  'profiles',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.Profiles)),
    state: E.ProfileState('state').notNull().default(ProfileState.ACTIVE),
    instanceId: varchar('instance_id')
      .references(() => Instances.id)
      .notNull(),
    handle: varchar('handle').notNull(),
    normalizedHandle: varchar('normalized_handle').notNull(),
    displayName: varchar('display_name').notNull().default(''),
    description: text('description'),
    avatarFileId: varchar('avatar_file_id').references(() => Files.id),
    headerFileId: varchar('header_file_id').references(() => Files.id),
    followAcceptMode: E.ProfileFollowAcceptMode('follow_accept_mode')
      .notNull()
      .default(ProfileFollowAcceptMode.AUTO),
    relationVisibility: E.ProfileRelationVisibility('relation_visibility')
      .notNull()
      .default(ProfileRelationVisibility.PUBLIC),
    followingCount: integer('following_count').notNull().default(0),
    followerCount: integer('follower_count').notNull().default(0),
    protocol: E.ProfileProtocol('protocol'),
    uri: varchar('uri').unique(),
    url: varchar('url'),
    inboxUrl: varchar('inbox_url'),
    sharedInboxUrl: varchar('shared_inbox_url'),
    config: jsonb('config').$type<{ defaultPostVisibility?: PostVisibility }>(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
    lastActivityAt: datetime('last_activity_at').default(sql`now()`),
    lastFetchedAt: datetime('last_fetched_at'),
  },
  (t) => [
    uniqueIndex('handle_unique').on(t.instanceId, t.normalizedHandle),
    index('last_activity_at_index').on(t.lastActivityAt),
  ],
);

export const ProfileAccounts = pgTable(
  'profile_accounts',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.ProfileAccounts)),
    accountId: varchar('account_id')
      .notNull()
      .references(() => Accounts.id),
    profileId: varchar('profile_id')
      .notNull()
      .references(() => Profiles.id),
    role: E.ProfileAccountRole('role').notNull(),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.accountId, t.profileId)],
);

export const ProfileBlocks = pgTable(
  'profile_blocks',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.ProfileBlocks)),
    profileId: varchar('profile_id')
      .notNull()
      .references(() => Profiles.id),
    targetProfileId: varchar('target_profile_id')
      .notNull()
      .references(() => Profiles.id),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.profileId, t.targetProfileId)],
);

export const ProfileCryptographicKeys = pgTable('profile_cryptographic_keys', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.ProfileCryptographicKeys)),
  profileId: varchar('profile_id')
    .notNull()
    .references(() => Profiles.id),
  kind: E.CryptographicKeyKind('kind').notNull(),
  privateKey: json('private_key').notNull().$type<JsonWebKey>(),
  publicKey: json('public_key').notNull().$type<JsonWebKey>(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

export const ProfileFollows = pgTable(
  'profile_follows',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.ProfileFollows)),
    profileId: varchar('profile_id')
      .notNull()
      .references(() => Profiles.id),
    targetProfileId: varchar('target_profile_id')
      .notNull()
      .references(() => Profiles.id),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.profileId, t.targetProfileId)],
);

export const ProfileFollowRequests = pgTable(
  'profile_follow_requests',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.ProfileFollowRequests)),
    profileId: varchar('profile_id')
      .notNull()
      .references(() => Profiles.id),
    targetProfileId: varchar('target_profile_id')
      .notNull()
      .references(() => Profiles.id),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.profileId, t.targetProfileId)],
);

export const ProfileMutes = pgTable(
  'profile_mutes',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => createDbId(TableCode.ProfileMutes)),
    profileId: varchar('profile_id')
      .notNull()
      .references(() => Profiles.id),
    targetProfileId: varchar('target_profile_id')
      .notNull()
      .references(() => Profiles.id),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.profileId, t.targetProfileId)],
);

export const Sessions = pgTable('sessions', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.Sessions)),
  applicationId: varchar('application_id')
    .notNull()
    .references(() => Applications.id),
  accountId: varchar('account_id')
    .notNull()
    .references(() => Accounts.id),
  profileId: varchar('profile_id').references(() => Profiles.id),
  token: varchar('token').unique().notNull(),
  scopes: json('scopes').$type<Scope[]>(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});
