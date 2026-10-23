import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ActivityPubActors,
  db,
  first,
  pg,
  pgRead,
  ProfileFollows,
  Profiles,
  Instances,
  withPrimaryDatabase,
} from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { closeFedifyQueue, fedifyQueue } from '../src/queue';
import { sendProfileFollowAccept } from '../src/profile-follow-delivery';

const RemoteProfiles = alias(Profiles, 'accept_recovery_remote_profile');
const RemoteInstances = alias(Instances, 'accept_recovery_remote_instance');
const RemoteActors = alias(ActivityPubActors, 'accept_recovery_remote_actor');
const LocalProfiles = alias(Profiles, 'accept_recovery_local_profile');
const LocalInstances = alias(Instances, 'accept_recovery_local_instance');

const idSchema = z.uuid().refine((value) => value === value.toLowerCase());
const inputSchema = z.strictObject({
  profileFollowId: idSchema,
  followerProfileId: idSchema,
  followeeProfileId: idSchema,
});

type FollowInput = z.infer<typeof inputSchema>;

const loadCurrentFollow = async (input: FollowInput) =>
  withPrimaryDatabase(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);

      return tx
        .select({
          profileFollowId: ProfileFollows.id,
          followerProfileId: ProfileFollows.followerProfileId,
          followeeProfileId: ProfileFollows.followeeProfileId,
          remoteProfileState: RemoteProfiles.state,
          remoteInstanceKind: RemoteInstances.kind,
          remoteInstanceState: RemoteInstances.state,
          remoteActorUri: RemoteActors.uri,
          remoteInboxUri: RemoteActors.inboxUri,
          remoteSharedInboxUri: RemoteActors.sharedInboxUri,
          localProfileState: LocalProfiles.state,
          localInstanceId: LocalInstances.id,
          localInstanceKind: LocalInstances.kind,
          localInstanceState: LocalInstances.state,
          localCanonicalOrigin: LocalInstances.canonicalOrigin,
        })
        .from(ProfileFollows)
        .innerJoin(RemoteProfiles, eq(RemoteProfiles.id, ProfileFollows.followerProfileId))
        .innerJoin(RemoteInstances, eq(RemoteInstances.id, RemoteProfiles.instanceId))
        .leftJoin(RemoteActors, eq(RemoteActors.profileId, RemoteProfiles.id))
        .innerJoin(LocalProfiles, eq(LocalProfiles.id, ProfileFollows.followeeProfileId))
        .innerJoin(LocalInstances, eq(LocalInstances.id, LocalProfiles.instanceId))
        .where(
          sql`${ProfileFollows.id} = ${input.profileFollowId}
            AND ${ProfileFollows.followerProfileId} = ${input.followerProfileId}
            AND ${ProfileFollows.followeeProfileId} = ${input.followeeProfileId}`,
        )
        .limit(1)
        .then(first);
    }),
  );

const requireHttpUrl = (value: string | null, name: string): URL => {
  let url: URL;
  try {
    if (value == null) throw new TypeError();
    url = new URL(value);
  } catch {
    throw new TypeError(`${name} must be an HTTP(S) URL without credentials.`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new TypeError(`${name} must be an HTTP(S) URL without credentials.`);
  }

  return url;
};

export const resendApprovedFollowAccept = async (value: unknown) => {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(
      'Input must contain only the exact Follow row ID and directed profile pair.',
    );
  }

  if (!fedifyQueue) {
    throw new Error('Fedify queue is not configured; refusing to send outside the queue.');
  }

  const input = parsed.data;
  const row = await loadCurrentFollow(input);
  if (!row) {
    throw new Error('No current profile_follow row matches the supplied ID.');
  }

  if (
    row.remoteProfileState !== ProfileState.ACTIVE ||
    row.remoteInstanceKind !== InstanceKind.ACTIVITYPUB ||
    row.remoteInstanceState !== InstanceState.ACTIVE ||
    row.localProfileState !== ProfileState.ACTIVE ||
    row.localInstanceKind !== InstanceKind.LOCAL ||
    row.localInstanceState !== InstanceState.ACTIVE
  ) {
    throw new Error('The current profile_follow pair is not active remote-to-local.');
  }

  if (!row.localCanonicalOrigin) {
    throw new Error('The local instance has no canonical origin.');
  }

  const localOriginUrl = requireHttpUrl(row.localCanonicalOrigin, 'Local canonical origin');
  if (
    localOriginUrl.pathname !== '/' ||
    localOriginUrl.search !== '' ||
    localOriginUrl.hash !== '' ||
    localOriginUrl.origin !== row.localCanonicalOrigin
  ) {
    throw new TypeError('Local canonical origin must be an HTTP(S) origin without credentials.');
  }

  const configuredLocalInstance = await withPrimaryDatabase(() =>
    resolveConfiguredLocalInstance({ publicOrigin: process.env.PUBLIC_ORIGIN }),
  );
  if (
    configuredLocalInstance.id !== row.localInstanceId ||
    configuredLocalInstance.canonicalOrigin !== row.localCanonicalOrigin
  ) {
    throw new Error('Followee instance does not match the configured local ActivityPub context.');
  }

  const remoteActorUri = requireHttpUrl(row.remoteActorUri, 'Remote actor URI');
  const remoteInboxUri = requireHttpUrl(row.remoteInboxUri, 'Remote actor inbox');
  const remoteSharedInboxUri =
    row.remoteSharedInboxUri == null
      ? null
      : requireHttpUrl(row.remoteSharedInboxUri, 'Remote shared inbox');
  const localActorUri = new URL(
    `/ap/actor/${encodeURIComponent(row.followeeProfileId)}`,
    localOriginUrl,
  );

  await sendProfileFollowAccept({
    actor: {
      uri: remoteActorUri.href,
      inboxUri: remoteInboxUri.href,
      sharedInboxUri: remoteSharedInboxUri?.href ?? null,
    },
    inboundFollow: {
      actorUri: remoteActorUri.href,
      objectUri: localActorUri.href,
    },
    senderProfileId: row.followeeProfileId,
  });

  return {
    status: 'queued' as const,
    profileFollowId: row.profileFollowId,
    followerProfileId: row.followerProfileId,
    followeeProfileId: row.followeeProfileId,
  };
};

const main = async () => {
  try {
    let inputText = '';
    for await (const chunk of process.stdin) {
      inputText += chunk.toString();
    }

    const result = await resendApprovedFollowAccept(JSON.parse(inputText) as unknown);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await Promise.allSettled([
      pg.end({ timeout: 5 }),
      ...(pgRead ? [pgRead.end({ timeout: 5 })] : []),
      closeFedifyQueue(),
    ]);
  }
};

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Accept queueing failed.'}\n`);
    process.exitCode = 1;
  });
}
