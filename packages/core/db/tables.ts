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

export const Accounts = pgTable(
  'account',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => createId(TableDiscriminator.Accounts)),
    oidcSubject: text('oidc_subject').notNull(),
    displayName: text('display_name').notNull(),
    state: Enum.accountState('state').notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.oidcSubject)],
);

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

export const Applications = pgTable('application', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => createId(TableDiscriminator.Applications)),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

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
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    followPolicy: Enum.followPolicy('follow_policy').notNull(),
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
    state: Enum.followState('state').notNull(),
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
    applicationId: uuid('application_id')
      .notNull()
      .references(() => Applications.id),
    activeProfileId: uuid('active_profile_id').references(() => Profiles.id),
    oidcSessionKey: text('oidc_session_key'),
    token: text('token').unique().notNull(),
    state: Enum.sessionState('state').notNull(),
    issuedAt: datetime('issued_at').notNull(),
    lastUsedAt: datetime('last_used_at').notNull(),
    expiresAt: datetime('expires_at').notNull(),
  },
  (table) => [index().on(table.accountId), index().on(table.state, table.expiresAt)],
);
