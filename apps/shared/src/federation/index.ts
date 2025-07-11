import {
  createFederation,
  Endpoints,
  exportJwk,
  generateCryptoKeyPair,
  importJwk,
  MemoryKvStore,
  Person,
} from '@fedify/fedify';
import { db, first, ProfileCryptographicKeys, Profiles } from '../db';
import { and, eq, isNull } from 'drizzle-orm';
import * as R from 'remeda';
import { CryptographicKeyKind, ProfileState } from '../enums';

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
      .where(and(eq(Profiles.id, identifier), isNull(Profiles.instanceId)))
      .then(first);

    if (!profile) {
      return null;
    }

    const keys = await ctx.getActorKeyPairs(identifier);

    return new Person({
      id: new URL(profile.uri),
      preferredUsername: profile.handle,
      name: profile.displayName,
      inbox: new URL(profile.inboxUri),
      endpoints: new Endpoints({
        sharedInbox: new URL(profile.sharedInboxUri!),
      }),
      url: new URL(profile.url ?? profile.uri),
      publicKeys: keys.map((key) => key.cryptographicKey),
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
      .innerJoin(Profiles, eq(ProfileCryptographicKeys.profileId, Profiles.id))
      .where(eq(Profiles.id, identifier))
      .then((rows) =>
        R.pullObject(
          rows,
          (row) => row.kind,
          (row) => ({ publicKey: row.publicKey, privateKey: row.privateKey }),
        ),
      );

    const keyPairs: CryptoKeyPair[] = [];

    for (const keyKind of Object.values(CryptographicKeyKind)) {
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
  });

federation.setInboxListeners('/profile/{identifier}/inbox', '/inbox');
