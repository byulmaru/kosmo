import {
  Accept,
  createFederation,
  Endpoints,
  exportJwk,
  Follow,
  generateCryptoKeyPair,
  importJwk,
  MemoryKvStore,
  Person,
} from '@fedify/fedify';
import { db, first, Instances, ProfileCryptographicKeys, ProfileFollows, Profiles } from '../db';
import { and, eq, isNull } from 'drizzle-orm';
import * as R from 'remeda';
import { getOrCreateProfile } from './profile';
import { KOSMO_INSTANCE_ID } from '../const';
import { InstanceType } from '../enums';

export const federation = createFederation<unknown>({
  kv: new MemoryKvStore(),
});

federation
  .setActorDispatcher('/profile/{identifier}', async (ctx, identifier) => {
    const profile = await db
      .select({
        id: Profiles.id,
        uri: Profiles.uri,
        url: Profiles.url,
        inboxUri: Profiles.inboxUri,
        sharedInboxUri: Profiles.sharedInboxUri,
        handle: Profiles.handle,
        displayName: Profiles.displayName,
        description: Profiles.description,
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Profiles.instanceId, Instances.id))
      .where(and(eq(Profiles.id, identifier), eq(Instances.type, InstanceType.LOCAL)))
      .then(first);

    if (!profile) {
      return null;
    }

    const keys = await ctx.getActorKeyPairs(identifier);

    return new Person({
      id: ctx.getActorUri(identifier),
      preferredUsername: profile.handle,
      name: profile.displayName,
      inbox: ctx.getInboxUri(identifier),
      endpoints: new Endpoints({
        sharedInbox: ctx.getInboxUri(),
      }),
      urls: [new URL(`/@${profile.handle}`, ctx.origin)],
      publicKey: keys[0].cryptographicKey,
      assertionMethods: keys.map((key) => key.multikey),
    });
  })
  .setKeyPairsDispatcher(async (ctx, identifier) => {
    const keys = await db
      .select({
        kind: ProfileCryptographicKeys.kind,
        publicKey: ProfileCryptographicKeys.publicKey,
        privateKey: ProfileCryptographicKeys.privateKey,
      })
      .from(ProfileCryptographicKeys)
      .where(eq(ProfileCryptographicKeys.profileId, identifier))
      .then((rows) =>
        R.pullObject(
          rows,
          (row) => row.kind,
          (row) => ({ publicKey: row.publicKey, privateKey: row.privateKey }),
        ),
      );

    const keyPairs: CryptoKeyPair[] = [];

    for (const keyKind of ['RSASSA-PKCS1-v1_5', 'Ed25519'] as const) {
      const key = keys[keyKind];
      if (key) {
        keyPairs.push({
          publicKey: await importJwk(key.publicKey, 'public'),
          privateKey: await importJwk(key.privateKey, 'private'),
        });
      } else {
        const { privateKey, publicKey } = await generateCryptoKeyPair(keyKind);

        await db.insert(ProfileCryptographicKeys).values({
          profileId: identifier,
          kind: keyKind,
          publicKey: await exportJwk(publicKey),
          privateKey: await exportJwk(privateKey),
        });

        keyPairs.push({ privateKey, publicKey });
      }
    }

    return keyPairs;
  })
  .mapHandle(async (_, username) => {
    return await db
      .select({
        id: Profiles.id,
      })
      .from(Profiles)
      .where(and(eq(Profiles.handle, username), eq(Profiles.instanceId, KOSMO_INSTANCE_ID)))
      .then((rows) => rows[0]?.id ?? null);
  });

federation
  .setInboxListeners('/profile/{identifier}/inbox', '/inbox')
  .on(Follow, async (ctx, follow) => {
    const object = ctx.parseUri(follow.objectId);
    if (object === null || object.type !== 'actor') {
      return;
    }

    const follower = await follow.getActor();
    if (follower === null || follower.id === null || follower.inboxId === null) {
      return;
    }

    const followingProfile = await db
      .select({
        id: Profiles.id,
      })
      .from(Profiles)
      .where(eq(Profiles.id, object.identifier))
      .then(first);

    if (followingProfile === undefined) {
      return;
    }

    await db.transaction(async (tx) => {
      const followerProfile = await getOrCreateProfile({ actor: follower, tx });
      await tx.insert(ProfileFollows).values({
        followerProfileId: followerProfile.id,
        followingProfileId: followingProfile.id,
      });
    });

    await ctx.sendActivity(
      object,
      follower,
      new Accept({
        actor: follow.objectId,
        to: follow.actorId,
        object: follow,
      }),
    );
  });
