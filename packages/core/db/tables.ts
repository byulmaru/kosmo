import { sql } from 'drizzle-orm';
import { index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import * as Enum from './enums';
import { createId, TableDiscriminator } from './id';
import { datetime } from './types';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

const createdAt = () =>
  datetime('created_at')
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
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html'),
    spoilerText: text('spoiler_text'),
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
    state: Enum.profileState('state').notNull().default('ACTIVE'),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    followPolicy: Enum.profileFollowPolicy('follow_policy').notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.handle)],
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
    state: Enum.profileFollowState('state').notNull(),
    createdAt: createdAt(),
    respondedAt: datetime('responded_at'),
  },
  (table) => [
    unique().on(table.followerProfileId, table.followeeProfileId),
    index().on(table.followeeProfileId, table.state),
    index().on(table.followerProfileId, table.state),
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
