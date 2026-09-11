import {
  ActivityPubActors,
  ActivityPubPosts,
  db,
  first,
  Instances,
  Posts,
  Profiles,
} from '@kosmo/core/db';
import { ContentReportTargetType, InstanceKind, ProfileState } from '@kosmo/core/enums';
import { decodeGlobalId } from '@kosmo/core/global-id';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, isNotNull } from 'drizzle-orm';
import { directPostAccessWhere } from '@/graphql/resolvers/post/access';
import { formatRelativeHandle } from '@/profile/identity';
import { visibleProfileWhere } from '@/profile/visibility';
import type { ContentReportReason } from '@kosmo/core/enums';
import type { UserContext } from '@/context';

export type ContentReportTarget = {
  id: string;
  kind: ContentReportTargetType;
  kosmoUrl: string;
  remoteUri: string | null;
};

export type ContentReportInput = {
  details?: string;
  reason: ContentReportReason;
  target: ContentReportTarget;
};

const createKosmoUrl = (canonicalOrigin: string, relativeHandle: string, id?: string) => {
  const handleSegment = encodeURIComponent(relativeHandle).replace(/%40/gi, '@');
  const path = id ? `/${handleSegment}/${encodeURIComponent(id)}` : `/${handleSegment}`;
  return new URL(path, canonicalOrigin).href;
};

const resolveRelativeHandle = async ({
  instance,
  profile,
}: {
  instance: { domain: string; id: string };
  profile: { handle: string; instanceId: string };
}) => {
  const configuredLocalInstance = await resolveConfiguredLocalInstance();
  return {
    configuredLocalInstance,
    relativeHandle: formatRelativeHandle(profile, {
      configuredLocalInstance,
      profileInstance: instance,
    }),
  };
};

const resolvePostTarget = async (id: string, ctx: UserContext) => {
  const post = await db
    .select({
      id: Posts.id,
      instanceDomain: Instances.domain,
      instanceId: Instances.id,
      instanceKind: Instances.kind,
      profileHandle: Profiles.handle,
      profileInstanceId: Profiles.instanceId,
      remoteUri: ActivityPubPosts.uri,
    })
    .from(Posts)
    .innerJoin(Profiles, eq(Profiles.id, Posts.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubPosts, eq(ActivityPubPosts.postId, Posts.id))
    .where(
      and(
        eq(Posts.id, id),
        isNotNull(Posts.currentContentId),
        directPostAccessWhere({ ctx, profileMute: 'ignore' }),
      ),
    )
    .limit(1)
    .then(first);

  if (!post) {
    return null;
  }

  const { configuredLocalInstance, relativeHandle } = await resolveRelativeHandle({
    instance: { domain: post.instanceDomain, id: post.instanceId },
    profile: { handle: post.profileHandle, instanceId: post.profileInstanceId },
  });

  return {
    id: post.id,
    kind: ContentReportTargetType.POST,
    kosmoUrl: createKosmoUrl(configuredLocalInstance.canonicalOrigin, relativeHandle, post.id),
    remoteUri: post.instanceKind === InstanceKind.ACTIVITYPUB ? post.remoteUri : null,
  } satisfies ContentReportTarget;
};

const resolveProfileTarget = async (id: string) => {
  const profile = await db
    .select({
      handle: Profiles.handle,
      id: Profiles.id,
      instanceDomain: Instances.domain,
      instanceId: Instances.id,
      instanceKind: Instances.kind,
      profileInstanceId: Profiles.instanceId,
      remoteUri: ActivityPubActors.uri,
    })
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
    .where(
      and(
        eq(Profiles.id, id),
        eq(Profiles.state, ProfileState.ACTIVE),
        visibleProfileWhere({ profile: Profiles, instance: Instances }),
      ),
    )
    .limit(1)
    .then(first);

  if (!profile) {
    return null;
  }

  const { configuredLocalInstance, relativeHandle } = await resolveRelativeHandle({
    instance: { domain: profile.instanceDomain, id: profile.instanceId },
    profile: { handle: profile.handle, instanceId: profile.profileInstanceId },
  });

  return {
    id: profile.id,
    kind: ContentReportTargetType.PROFILE,
    kosmoUrl: createKosmoUrl(configuredLocalInstance.canonicalOrigin, relativeHandle),
    remoteUri: profile.instanceKind === InstanceKind.ACTIVITYPUB ? profile.remoteUri : null,
  } satisfies ContentReportTarget;
};

export const resolveContentReportTarget = async (
  {
    id,
    kind,
  }: {
    id: string;
    kind: ContentReportTargetType;
  },
  ctx: UserContext,
): Promise<ContentReportTarget | null> => {
  let decoded: ReturnType<typeof decodeGlobalId>;
  try {
    decoded = decodeGlobalId(id);
  } catch {
    return null;
  }

  const expectedTypename = kind === ContentReportTargetType.POST ? 'Post' : 'Profile';
  if (decoded.typename !== expectedTypename) {
    return null;
  }

  return kind === ContentReportTargetType.POST
    ? resolvePostTarget(decoded.id, ctx)
    : resolveProfileTarget(decoded.id);
};
