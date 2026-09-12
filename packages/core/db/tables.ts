import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import * as Enum from './enums';
import { datetime } from './types';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type * as CoreEnum from '../enums';
import type { PostContentDocumentV1 } from '../post-content';

type JsonWebKeyRecord = Record<string, unknown>;

export type ProfileBlockCleanupEffectPlan = readonly {
  readonly kind: 'DELETE';
  readonly input: {
    readonly sourceId: string;
    readonly sourceKind: 'FOLLOW' | 'FOLLOW_REQUEST';
    readonly followerProfileId: string;
    readonly followeeProfileId: string;
    readonly sendActivityPub?: boolean;
  };
}[];

const createdAt = () =>
  datetime('created_at')
    .notNull()
    .default(sql`now()`);

const updatedAt = () =>
  datetime('updated_at')
    .notNull()
    .default(sql`now()`);

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

export const Accounts = pgTable('account', {
  id: id(),
  oidcSubject: text('oidc_subject').unique().notNull(),
  displayName: text('display_name').notNull(),
  featureFlags: text('feature_flags').array().notNull().default([]),
  state: Enum.accountState('state').notNull(),
  createdAt: createdAt(),
});

export const AccountProfiles = pgTable(
  'account_profile',
  {
    id: id(),
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
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    uri: text('uri').unique().notNull(),
    profileUrl: text('profile_url'),
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
    id: id(),
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

export const ActivityPubPosts = pgTable('activitypub_post', {
  id: id(),
  uri: text('uri').unique().notNull(),
  postId: uuid('post_id')
    .unique()
    .notNull()
    .references(() => Posts.id, { onDelete: 'cascade' }),
  receivedAt: datetime('received_at').notNull(),
  publishedAt: datetime('published_at'),
});

export const ActivityPubReactions = pgTable('activitypub_reaction', {
  uri: text('uri').unique().notNull(),
  reactionId: uuid('reaction_id')
    .primaryKey()
    .references(() => Reactions.id, { onDelete: 'cascade' }),
});

export const Applications = pgTable(
  'application',
  {
    id: id(),
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
    id: id(),
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

export const Bookmarks = pgTable(
  'bookmark',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => Posts.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.profileId, table.postId),
    index().on(table.profileId, table.id.desc()),
  ],
);

export const Hashtags = pgTable('hashtag', {
  id: id(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: createdAt(),
});

export const Instances = pgTable(
  'instance',
  {
    id: id(),
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
    id: id(),
    source: Enum.mediaSource('source').notNull(),
    state: Enum.mediaState('state').notNull(),
    accountId: uuid('account_id').references(() => Accounts.id),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id),
    mediaType: text('media_type'),
    url: text('url'),
    altText: text('alt_text'),
    storageReference: text('storage_reference').unique(),
    uploadExpiresAt: datetime('upload_expires_at'),
    readyAt: datetime('ready_at'),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      'media_source_state_fields_check',
      sql`
        (
          ${table.source} = 'LOCAL'
          AND ${table.accountId} IS NOT NULL
          AND ${table.storageReference} IS NOT NULL
          AND ${table.uploadExpiresAt} IS NOT NULL
          AND (
            (
              ${table.state} = 'UPLOADING'
              AND ${table.mediaType} IS NULL
              AND ${table.url} IS NULL
              AND ${table.readyAt} IS NULL
            )
            OR (
              ${table.state} = 'READY'
              AND ${table.mediaType} IS NOT NULL
              AND ${table.url} IS NOT NULL
              AND ${table.readyAt} IS NOT NULL
            )
          )
        )
        OR (
          ${table.source} = 'REMOTE'
          AND ${table.state} = 'READY'
          AND ${table.accountId} IS NULL
          AND ${table.storageReference} IS NULL
          AND ${table.uploadExpiresAt} IS NULL
          AND ${table.url} IS NOT NULL
          AND ${table.readyAt} IS NULL
        )
      `,
    ),
    index().on(table.accountId),
    index().on(table.profileId),
  ],
);

export const Notifications = pgTable(
  'notification',
  {
    id: id(),
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
    index().on(table.recipientProfileId, table.id.desc()),
    index()
      .on(table.recipientProfileId)
      .where(sql`${table.readAt} IS NULL`),
  ],
);

export const OAuthAuthorizationCodes = pgTable(
  'oauth_authorization_code',
  {
    id: id(),
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
    id: id(),
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
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id),
    visibility: Enum.postVisibility('visibility').notNull(),
    state: Enum.postState('state').notNull(),
    currentContentId: uuid('current_content_id').references((): AnyPgColumn => PostContents.id),
    replyParentId: uuid('reply_parent_id').references((): AnyPgColumn => Posts.id, {
      onDelete: 'set null',
    }),
    repostSourceId: uuid('repost_source_id').references((): AnyPgColumn => Posts.id),
    createdAt: createdAt(),
    deletedAt: datetime('deleted_at'),
  },
  (table) => [
    check(
      'post_reply_parent_not_self',
      sql`${table.replyParentId} IS NULL OR ${table.replyParentId} <> ${table.id}`,
    ),
    index().on(table.profileId, table.id.desc()),
    index('post_reply_parent_id_index')
      .on(table.replyParentId)
      .where(sql`${table.replyParentId} IS NOT NULL`),
    uniqueIndex('post_active_repost_profile_source_unique')
      .on(table.profileId, table.repostSourceId)
      .where(
        sql`${table.state} = 'ACTIVE' AND ${table.currentContentId} IS NULL AND ${table.repostSourceId} IS NOT NULL`,
      ),
  ],
);

export const PostContents = pgTable(
  'post_content',
  {
    id: id(),
    postId: uuid('post_id').references((): AnyPgColumn => Posts.id),
    document: jsonb('document').$type<PostContentDocumentV1>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.postId)],
);

export const PostMentions = pgTable(
  'post_mentions',
  {
    postContentId: uuid('post_content_id')
      .notNull()
      .references(() => PostContents.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.postContentId, table.profileId] }),
    index().on(table.profileId),
  ],
);

export const Profiles = pgTable(
  'profile',
  {
    id: id(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => Instances.id),
    state: Enum.profileState('state').notNull().default('ACTIVE'),
    handle: text('handle').notNull(),
    normalizedHandle: text('normalized_handle').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    defaultPostVisibility: Enum.postVisibility('default_post_visibility'),
    followPolicy: Enum.profileFollowPolicy('follow_policy').notNull(),
    followersCount: integer('followers_count').notNull().default(0),
    followingCount: integer('following_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.instanceId, table.normalizedHandle)],
);

export const ProfileBlocks = pgTable(
  'profile_block',
  {
    id: id(),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    targetProfileId: uuid('target_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    closingAt: datetime('closing_at'),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.ownerProfileId, table.targetProfileId),
    check(
      'profile_block_owner_not_target',
      sql`${table.ownerProfileId} <> ${table.targetProfileId}`,
    ),
    index().on(table.targetProfileId),
  ],
);

/**
 * Durable ActivityPub identity for a Profile Block generation.  The optional
 * Profile Block id is intentionally not a foreign key: an Undo must retain
 * the original generation after the product relation has been deleted.
 */
export const ProfileBlockActivities = pgTable(
  'profile_block_activity',
  {
    id: id(),
    activityUri: text('activity_uri').notNull().unique(),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    targetProfileId: uuid('target_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    actorUri: text('actor_uri').notNull(),
    objectUri: text('object_uri').notNull(),
    origin: Enum.profileBlockActivityOrigin('origin').notNull(),
    state: Enum.profileBlockActivityState('state').notNull().default('ACTIVE'),
    deliveryState: Enum.profileBlockDeliveryState('delivery_state').notNull().default('NONE'),
    undoDeliveryState: Enum.profileBlockDeliveryState('undo_delivery_state')
      .notNull()
      .default('NONE'),
    profileBlockId: uuid('profile_block_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: datetime('closed_at'),
  },
  (table) => [
    index().on(table.ownerProfileId, table.targetProfileId, table.state),
    index().on(table.profileBlockId),
    check(
      'profile_block_activity_owner_not_target',
      sql`${table.ownerProfileId} <> ${table.targetProfileId}`,
    ),
  ],
);

/**
 * Immutable, transaction-owned Follow cleanup receipt for one Block command.
 * The product generation ID is intentionally not a foreign key so a receipt
 * can recover effects after the product row has been replaced or deleted.
 */
export const ProfileBlockCleanupBatches = pgTable(
  'profile_block_cleanup_batch',
  {
    id: id(),
    operation: text('operation').$type<CoreEnum.ProfileBlockCleanupOperation>().notNull(),
    operationId: uuid('operation_id').notNull(),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    targetProfileId: uuid('target_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    profileBlockId: uuid('profile_block_id').notNull(),
    origin: text('origin').$type<CoreEnum.ProfileBlockCleanupOrigin>().notNull(),
    protocolActivityUri: text('protocol_activity_uri'),
    protocolState: text('protocol_state').$type<CoreEnum.ProfileBlockActivityState>(),
    changed: boolean('changed').notNull(),
    effectPlan: jsonb('effect_plan').$type<ProfileBlockCleanupEffectPlan>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    settledAt: datetime('settled_at'),
  },
  (table) => [
    unique().on(table.operation, table.operationId),
    index().on(table.ownerProfileId, table.targetProfileId, table.settledAt),
    check(
      'profile_block_cleanup_batch_operation_check',
      sql`${table.operation} IN ('BLOCK', 'UNBLOCK')`,
    ),
    check(
      'profile_block_cleanup_batch_origin_check',
      sql`${table.origin} IN ('LOCAL', 'ACTIVITYPUB')`,
    ),
  ],
);

export const ProfileFollows = pgTable(
  'profile_follow',
  {
    id: id(),
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
    id: id(),
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

export const ProfileHashtags = pgTable(
  'profile_hashtag',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    hashtagId: uuid('hashtag_id')
      .notNull()
      .references(() => Hashtags.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.profileId, table.hashtagId), index().on(table.hashtagId)],
);

export const ProfileMedia = pgTable(
  'profile_media',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => Media.id, { onDelete: 'cascade' }),
    kind: Enum.profileMediaKind('kind').notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.profileId, table.kind), index().on(table.mediaId)],
);

export const ProfileMutes = pgTable(
  'profile_mute',
  {
    id: id(),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    targetProfileId: uuid('target_profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: datetime('expires_at'),
  },
  (table) => [
    unique().on(table.ownerProfileId, table.targetProfileId),
    index().on(table.ownerProfileId, table.id.desc()),
    index().on(table.targetProfileId),
  ],
);

export const Reactions = pgTable(
  'reaction',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => Posts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique().on(table.postId, table.type, table.profileId),
    index().on(table.profileId),
    index().on(table.postId, table.type, table.createdAt.desc(), table.id.desc()),
  ],
);

export const Sessions = pgTable(
  'session',
  {
    id: id(),
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

export const PushInstallations = pgTable(
  'push_installation',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => Accounts.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => Sessions.id, { onDelete: 'cascade' }),
    platform: Enum.pushInstallationPlatform('platform').notNull(),
    token: text('token').notNull(),
    registrationEpoch: datetime('registration_epoch')
      .notNull()
      .default(sql`now()`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Escape backslashes before PostgreSQL's text-to-bytea cast so opaque strings stay distinct.
    uniqueIndex('push_installation_token_hash_unique').using(
      'btree',
      sql`sha256(replace(${table.token}, chr(92), chr(92) || chr(92))::bytea)`,
    ),
    index().on(table.accountId),
    index().on(table.sessionId),
  ],
);
