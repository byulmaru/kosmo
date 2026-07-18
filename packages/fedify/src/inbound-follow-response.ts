import '@kosmo/core/polyfill';

import { Follow } from '@fedify/vocab';
import {
  ActivityPubActors,
  db,
  first,
  Instances,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq, getColumns } from 'drizzle-orm';
import { findUsableStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Accept, Reject } from '@fedify/vocab';
import type { SQL } from 'drizzle-orm';

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type FollowResponse = Accept | Reject;
type OutboundProfileFollowProjection = {
  readonly createdAt: Temporal.Instant;
  readonly followeeProfileId: string;
  readonly followerProfileId: string;
  readonly id: string;
};
type OutboundProfileFollowPair = Pick<
  OutboundProfileFollowProjection,
  'followeeProfileId' | 'followerProfileId'
>;
type LocalProfileActor = {
  readonly actor: typeof ActivityPubActors.$inferSelect;
  readonly profile: typeof Profiles.$inferSelect;
};

const isHttpUri = (uri: URL | null): uri is URL =>
  uri !== null && (uri.protocol === 'http:' || uri.protocol === 'https:');

const noNetworkDocumentLoader = async (url: string) => {
  throw new Error(`Network lookup is disabled for inbound Follow response: ${url}`);
};

const parseKosmoFollowActivityUri = (
  uri: URL,
  canonicalOrigin: string,
): { readonly kind: 'KOSMO'; readonly rowId: string } | { readonly kind: 'MALFORMED' } | null => {
  const origin = new URL(canonicalOrigin);
  if (uri.origin !== origin.origin) {
    return null;
  }

  const match = /^\/ap\/follow\/([^/]+)$/.exec(uri.pathname);
  if (!match) {
    return uri.pathname.startsWith('/ap/follow/') ? { kind: 'MALFORMED' } : null;
  }

  let rowId: string;
  try {
    rowId = decodeURIComponent(match[1]!);
  } catch {
    return { kind: 'MALFORMED' };
  }

  if (uri.search || uri.hash || match[1] !== rowId || !canonicalUuidPattern.test(rowId)) {
    return { kind: 'MALFORMED' };
  }

  return { kind: 'KOSMO', rowId };
};

const findActiveLocalProfileActorByUri = async (
  actorUri: URL,
): Promise<LocalProfileActor | undefined> =>
  db
    .select({
      actor: getColumns(ActivityPubActors),
      profile: getColumns(Profiles),
    })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ActivityPubActors.uri, actorUri.href),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

const recipientMatches = (
  context: InboxContext<void>,
  localProfileActor: LocalProfileActor,
): boolean =>
  context.recipient === null ||
  (context.recipient === localProfileActor.profile.id &&
    context.getActorUri(context.recipient).href === localProfileActor.actor.uri);

const findUsableRemoteActor = async (actorUri: URL) => {
  try {
    return await findUsableStoredRemoteProfileActorByUri(actorUri);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return undefined;
    }
    throw error;
  }
};

const findOutboundProfileFollowProjection = async (
  relationCondition: SQL,
  requestCondition: SQL,
): Promise<OutboundProfileFollowProjection | undefined> => {
  const established = await db
    .select()
    .from(ProfileFollows)
    .where(relationCondition)
    .limit(1)
    .then(first);
  return (
    established ??
    (await db.select().from(ProfileFollowRequests).where(requestCondition).limit(1).then(first))
  );
};

const findOutboundProfileFollowProjectionById = (id: string) =>
  findOutboundProfileFollowProjection(eq(ProfileFollows.id, id), eq(ProfileFollowRequests.id, id));

const findOutboundProfileFollowProjectionByPair = ({
  followeeProfileId,
  followerProfileId,
}: OutboundProfileFollowPair) =>
  findOutboundProfileFollowProjection(
    and(
      eq(ProfileFollows.followerProfileId, followerProfileId),
      eq(ProfileFollows.followeeProfileId, followeeProfileId),
    )!,
    and(
      eq(ProfileFollowRequests.followerProfileId, followerProfileId),
      eq(ProfileFollowRequests.followeeProfileId, followeeProfileId),
    )!,
  );

const resolveEmbeddedProjection = async (
  context: InboxContext<void>,
  responseActorUri: URL,
  remoteProfileId: string,
  follow: Follow,
): Promise<OutboundProfileFollowProjection | undefined> => {
  const followerActorUri = follow.actorId;
  const followeeActorUri = follow.objectId;
  if (
    !isHttpUri(followerActorUri) ||
    !isHttpUri(followeeActorUri) ||
    followeeActorUri.href !== responseActorUri.href
  ) {
    return undefined;
  }

  const localProfileActor = await findActiveLocalProfileActorByUri(followerActorUri);
  if (!localProfileActor || !recipientMatches(context, localProfileActor)) {
    return undefined;
  }

  const pair = {
    followeeProfileId: remoteProfileId,
    followerProfileId: localProfileActor.profile.id,
  };
  if (!follow.id) {
    return findOutboundProfileFollowProjectionByPair(pair);
  }

  const parsed = parseKosmoFollowActivityUri(follow.id, context.canonicalOrigin);
  if (parsed?.kind === 'MALFORMED') {
    return undefined;
  }
  if (!parsed) {
    return findOutboundProfileFollowProjectionByPair(pair);
  }

  const projection = await findOutboundProfileFollowProjectionById(parsed.rowId);
  return projection?.followerProfileId === pair.followerProfileId &&
    projection.followeeProfileId === pair.followeeProfileId
    ? projection
    : undefined;
};

const resolveIriProjection = async (
  context: InboxContext<void>,
  remoteProfileId: string,
  objectUri: URL,
): Promise<OutboundProfileFollowProjection | undefined> => {
  const parsed = parseKosmoFollowActivityUri(objectUri, context.canonicalOrigin);
  if (parsed?.kind !== 'KOSMO') {
    return undefined;
  }

  const projection = await findOutboundProfileFollowProjectionById(parsed.rowId);
  if (!projection) {
    return undefined;
  }

  const localProfileActor = await db
    .select({
      actor: getColumns(ActivityPubActors),
      profile: getColumns(Profiles),
    })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(Profiles.id, projection.followerProfileId),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first);

  return localProfileActor &&
    remoteProfileId === projection.followeeProfileId &&
    recipientMatches(context, localProfileActor)
    ? projection
    : undefined;
};

export const resolveInboundFollowResponseProjection = async (
  context: InboxContext<void>,
  response: FollowResponse,
): Promise<OutboundProfileFollowProjection | undefined> => {
  const responseActorUri = response.actorId;
  if (!isHttpUri(responseActorUri)) {
    return undefined;
  }

  // A verified inbound activity is a reachability signal even if its object is unsupported.
  const remoteActor = await findUsableRemoteActor(responseActorUri);
  if (!remoteActor) {
    return undefined;
  }

  const embedded = await response.getObject({
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  });
  if (embedded instanceof Follow) {
    return resolveEmbeddedProjection(context, responseActorUri, remoteActor.profile.id, embedded);
  }

  const objectUri = response.objectId;
  return isHttpUri(objectUri)
    ? resolveIriProjection(context, remoteActor.profile.id, objectUri)
    : undefined;
};
