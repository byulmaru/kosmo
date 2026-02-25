import {
  Accept,
  Create,
  createFederation,
  Endpoints,
  exportJwk,
  Follow,
  generateCryptoKeyPair,
  Image,
  importJwk,
  MemoryKvStore,
  Person,
  Undo,
} from '@fedify/fedify';
import { AVATAR_FILE_ID, KOSMO_INSTANCE_ID } from '@kosmo/const';
import { db, first, Instances, ProfileCryptographicKeys, Profiles } from '@kosmo/db';
import { InstanceType, ProfileFollowAcceptMode } from '@kosmo/enum';
import { env } from '@kosmo/env';
import { NatsMessageQueue } from '@kosmo/fedify-nats-message-queue';
import { fedifyStreamName, fedifySubject, js } from '@kosmo/nats';
import { and, eq } from 'drizzle-orm';
import * as R from 'remeda';
import { followerCounter, followerDispatcher } from './dispatcher/follower';
import { followingCounter, followingDispatcher } from './dispatcher/following';
import { acceptListener } from './inbox/accept';
import { createListener } from './inbox/create';
import { followListener } from './inbox/follow';
import { undoListener } from './inbox/undo';
import type { FederationContextData } from './type';

export const federation = createFederation<FederationContextData>({
  kv: new MemoryKvStore(),
  queue: new NatsMessageQueue({
    js,
    streamName: fedifyStreamName,
    subject: fedifySubject,
  }),
});

export const getFedifyContext = (domain: string) => {
  const request = new Request(new URL(domain));
  return federation.createContext(request, null);
};

federation
  .setActorDispatcher('/profile/{identifier}', async (ctx, identifier) => {
    const profile = await db
      .select({
        id: Profiles.id,
        handle: Profiles.handle,
        displayName: Profiles.displayName,
        description: Profiles.description,
        followAcceptMode: Profiles.followAcceptMode,
        avatarFileId: Profiles.avatarFileId,
        headerFileId: Profiles.headerFileId,
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
      followers: ctx.getFollowersUri(identifier),
      following: ctx.getFollowingUri(identifier),
      manuallyApprovesFollowers: profile.followAcceptMode === ProfileFollowAcceptMode.MANUAL,
      icon: new Image({
        url: new URL(
          `${env.PUBLIC_IMAGE_DOMAIN}/${profile.avatarFileId ?? AVATAR_FILE_ID}/original`,
        ),
        mediaType: 'image/webp',
      }),
      image: profile.headerFileId
        ? new Image({
            url: new URL(`${env.PUBLIC_IMAGE_DOMAIN}/${profile.headerFileId}/original`),
            mediaType: 'image/webp',
          })
        : undefined,
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
  .on(Accept, acceptListener)
  .on(Create, createListener)
  .on(Follow, followListener)
  .on(Undo, undoListener);

federation
  .setFollowersDispatcher('/profile/{identifier}/followers', followerDispatcher)
  .setCounter(followerCounter);

federation
  .setFollowingDispatcher('/profile/{identifier}/following', followingDispatcher)
  .setCounter(followingCounter);
