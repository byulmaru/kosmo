import { integer, json, pgTable, text, unique, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { datetime } from './types';
import { eq, sql } from 'drizzle-orm';
import { createDbId, TableCode } from './id';
import * as E from './enums';
import { AccountState, ProfileState } from '@kosmo/enum';
import type { Scope } from '@kosmo/type';
import type { LANGUAGE_LIST } from '@kosmo/i18n';

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
    languages: json('languages').$type<LANGUAGE_LIST[]>().notNull().default(['ko-KR', 'en-US']),
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
  (t) => [uniqueIndex('application_id_account_id_unique').on(t.applicationId, t.accountId)],
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
  (t) => [
    unique('application_grant_id_profile_id_unique')
      .on(t.applicationGrantId, t.profileId)
      .nullsNotDistinct(),
  ],
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
  ownership: E.FileOwnership('ownership').notNull(),
  hash: varchar('hash').unique(),
  path: varchar('path').notNull(),
  mimeType: varchar('mime_type').notNull(),
  size: integer('size').notNull(),
  metadata: json('metadata'),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

export const Instances = pgTable('instances', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.Instances)),
  domain: varchar('domain').notNull().unique(),
  type: E.InstanceType('type').notNull(),
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
    uri: varchar('uri'),
    url: varchar('url'),
    state: E.ProfileState('state').notNull().default(ProfileState.ACTIVE),
    instanceId: varchar('instance_id')
      .references(() => Instances.id)
      .notNull(),
    handle: varchar('handle').notNull(),
    displayName: varchar('display_name').notNull().default(''),
    description: text('description'),
    inboxUri: varchar('inbox_uri'),
    sharedInboxUri: varchar('shared_inbox_uri'),
    avatarFileId: varchar('avatar_file_id').references(() => Files.id),
    headerFileId: varchar('header_file_id').references(() => Files.id),
    followingCount: integer('following_count').notNull().default(0),
    followersCount: integer('followers_count').notNull().default(0),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex('uri_unique').on(t.uri),
    uniqueIndex('handle_unique').on(t.instanceId, sql`LOWER(${t.handle})`),
  ],
);

export const ProfileAccounts = pgTable('profile_accounts', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => createDbId(TableCode.ProfileAccounts)),
  profileId: varchar('profile_id')
    .notNull()
    .references(() => Profiles.id),
  accountId: varchar('account_id')
    .notNull()
    .references(() => Accounts.id),
  role: E.ProfileAccountRole('role').notNull(),
  createdAt: datetime('created_at')
    .notNull()
    .default(sql`now()`),
});

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
    followerProfileId: varchar('follower_profile_id')
      .notNull()
      .references(() => Profiles.id),
    followingProfileId: varchar('following_profile_id')
      .notNull()
      .references(() => Profiles.id),
    createdAt: datetime('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique('follower_profile_id_following_profile_id_unique').on(
      t.followerProfileId,
      t.followingProfileId,
    ),
  ],
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
