import { and, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';
import {
  ActivityPubActors,
  ActivityPubPosts,
  ActivityPubReactions,
  db,
  first,
  Instances,
  Posts,
  ProfileFollows,
  Profiles,
  Reactions,
} from '../db';
import { InstanceKind, InstanceState, PostState, PostVisibility, ProfileState } from '../enums';
import { reactionTypeSchema } from '../validation';
import { addReaction, deleteReaction } from './reaction';
import type { Transaction } from '../db';

type MaterializeInboundReactionInput = {
  readonly activityUri: string;
  readonly actorUri: string;
  readonly objectUri: string;
  readonly type: string;
};

type MaterializeInboundReactionResult =
  | {
      readonly kind: 'CREATED' | 'MAPPED' | 'DUPLICATE';
      readonly reaction: typeof Reactions.$inferSelect;
    }
  | { readonly kind: 'REJECTED' };

type InboundReactionTarget = {
  readonly postId: string;
};

class InboundReactionConflict extends Error {}

const isHttpUri = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const postAccessWhere = (actorProfileId: string) =>
  and(
    eq(Posts.state, PostState.ACTIVE),
    eq(Profiles.state, ProfileState.ACTIVE),
    ne(Instances.state, InstanceState.SUSPENDED),
    or(
      inArray(Posts.visibility, [PostVisibility.PUBLIC, PostVisibility.UNLISTED]),
      eq(Posts.profileId, actorProfileId),
      and(eq(Posts.visibility, PostVisibility.FOLLOWERS), isNotNull(ProfileFollows.id)),
    ),
  );

const parseLocalNoteId = (objectUri: string): string | undefined => {
  const url = new URL(objectUri);
  const match = /^\/ap\/note\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(
    url.pathname,
  );

  return url.search === '' && url.hash === '' ? match?.[1] : undefined;
};

const findInboundReactionTarget = async (
  tx: Transaction,
  { actorProfileId, objectUri }: { actorProfileId: string; objectUri: string },
): Promise<InboundReactionTarget | undefined> => {
  const remote = await tx
    .select({
      postId: Posts.id,
    })
    .from(ActivityPubPosts)
    .innerJoin(Posts, eq(Posts.id, ActivityPubPosts.postId))
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(
      ProfileFollows,
      and(
        eq(ProfileFollows.followerProfileId, actorProfileId),
        eq(ProfileFollows.followeeProfileId, Posts.profileId),
      ),
    )
    .where(
      and(
        eq(ActivityPubPosts.uri, objectUri),
        eq(Instances.kind, InstanceKind.ACTIVITYPUB),
        postAccessWhere(actorProfileId),
      ),
    )
    .limit(1)
    .then(first);
  if (remote) {
    return remote;
  }

  const localPostId = parseLocalNoteId(objectUri);
  if (!localPostId) {
    return undefined;
  }

  const local = await tx
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      postId: Posts.id,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(
      ProfileFollows,
      and(
        eq(ProfileFollows.followerProfileId, actorProfileId),
        eq(ProfileFollows.followeeProfileId, Posts.profileId),
      ),
    )
    .where(
      and(
        eq(Posts.id, localPostId),
        isNotNull(Posts.currentContentId),
        eq(Instances.kind, InstanceKind.LOCAL),
        postAccessWhere(actorProfileId),
      ),
    )
    .limit(1)
    .then(first);
  if (!local?.canonicalOrigin) {
    return undefined;
  }

  const canonicalObjectUri = new URL(`/ap/note/${local.postId}`, local.canonicalOrigin).href;
  if (canonicalObjectUri !== objectUri) {
    return undefined;
  }

  return {
    postId: local.postId,
  };
};

const findMappedReaction = async (tx: Transaction, activityUri: string) =>
  tx
    .select({ reaction: Reactions })
    .from(ActivityPubReactions)
    .innerJoin(Reactions, eq(Reactions.id, ActivityPubReactions.reactionId))
    .where(eq(ActivityPubReactions.uri, activityUri))
    .limit(1)
    .then(first)
    .then((row) => row?.reaction);

const isSameReaction = (
  reaction: typeof Reactions.$inferSelect,
  { actorProfileId, postId, type }: { actorProfileId: string; postId: string; type: string },
) => reaction.profileId === actorProfileId && reaction.postId === postId && reaction.type === type;

export const materializeInboundReaction = async (
  input: MaterializeInboundReactionInput,
): Promise<MaterializeInboundReactionResult> => {
  const parsedType = reactionTypeSchema.safeParse(input.type);
  if (
    !parsedType.success ||
    !isHttpUri(input.activityUri) ||
    !isHttpUri(input.actorUri) ||
    !isHttpUri(input.objectUri)
  ) {
    return { kind: 'REJECTED' };
  }

  let result: Exclude<MaterializeInboundReactionResult, { kind: 'REJECTED' }> & {
    readonly postCommit: () => Promise<void>;
  };
  try {
    result = await db.transaction(async (tx) => {
      const actor = await tx
        .select({ profileId: Profiles.id })
        .from(ActivityPubActors)
        .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            eq(ActivityPubActors.uri, input.actorUri),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Instances.kind, InstanceKind.ACTIVITYPUB),
            eq(Instances.state, InstanceState.ACTIVE),
          ),
        )
        .limit(1)
        .then(first);
      if (!actor) {
        throw new InboundReactionConflict();
      }

      const target = await findInboundReactionTarget(tx, {
        actorProfileId: actor.profileId,
        objectUri: input.objectUri,
      });
      if (!target) {
        throw new InboundReactionConflict();
      }

      const identity = {
        actorProfileId: actor.profileId,
        origin: 'ACTIVITYPUB' as const,
        postId: target.postId,
        type: parsedType.data,
      };
      const existingMapping = await findMappedReaction(tx, input.activityUri);
      if (existingMapping) {
        if (!isSameReaction(existingMapping, identity)) {
          throw new InboundReactionConflict();
        }
        return {
          kind: 'DUPLICATE' as const,
          postCommit: async () => {},
          reaction: existingMapping,
        };
      }

      const reactionResult = await addReaction(identity, tx);
      const insertedMapping = await tx
        .insert(ActivityPubReactions)
        .values({ reactionId: reactionResult.reaction.id, uri: input.activityUri })
        .onConflictDoNothing()
        .returning({ reactionId: ActivityPubReactions.reactionId })
        .then(first);
      if (insertedMapping) {
        return {
          kind: reactionResult.created ? ('CREATED' as const) : ('MAPPED' as const),
          postCommit: reactionResult.postCommit,
          reaction: reactionResult.reaction,
        };
      }

      const concurrentMapping = await findMappedReaction(tx, input.activityUri);
      if (!concurrentMapping || !isSameReaction(concurrentMapping, identity)) {
        throw new InboundReactionConflict();
      }

      return {
        kind: 'DUPLICATE' as const,
        postCommit: async () => {},
        reaction: concurrentMapping,
      };
    });
  } catch (error) {
    if (error instanceof InboundReactionConflict) {
      return { kind: 'REJECTED' };
    }
    throw error;
  }

  await result.postCommit();

  return { kind: result.kind, reaction: result.reaction };
};

export const undoInboundReaction = async ({
  activityUri,
  actorUri,
}: {
  readonly activityUri: string;
  readonly actorUri: string;
}): Promise<{ readonly reactionId: string | null }> => {
  if (!isHttpUri(activityUri) || !isHttpUri(actorUri)) {
    return { reactionId: null };
  }

  const deleted = await db.transaction(async (tx) => {
    const mapped = await tx
      .select({ reaction: Reactions })
      .from(ActivityPubReactions)
      .innerJoin(Reactions, eq(Reactions.id, ActivityPubReactions.reactionId))
      .innerJoin(Profiles, eq(Profiles.id, Reactions.profileId))
      .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
      .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
      .where(
        and(
          eq(ActivityPubReactions.uri, activityUri),
          eq(ActivityPubActors.uri, actorUri),
          eq(Profiles.state, ProfileState.ACTIVE),
          eq(Instances.kind, InstanceKind.ACTIVITYPUB),
          eq(Instances.state, InstanceState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);
    if (!mapped) {
      return null;
    }

    const deleted = await deleteReaction(
      {
        actorProfileId: mapped.reaction.profileId,
        expectedReactionId: mapped.reaction.id,
        origin: 'ACTIVITYPUB',
        postId: mapped.reaction.postId,
        type: mapped.reaction.type,
      },
      tx,
    );

    return deleted;
  });

  await deleted?.postCommit();

  return { reactionId: deleted?.reaction?.id ?? null };
};
