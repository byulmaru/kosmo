import '@kosmo/core/polyfill';

import { CryptographicKey, Multikey } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';
import { createLocalProfilePerson } from './local-profile-actor';
import type { ActorKeyPair } from '@fedify/fedify';

const actorUri = new URL('https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666');

const generateKeyPair = async (
  algorithmName: 'RSASSA-PKCS1-v1_5' | 'Ed25519',
): Promise<CryptoKeyPair> => {
  if (algorithmName === 'RSASSA-PKCS1-v1_5') {
    return crypto.subtle.generateKey(
      {
        name: algorithmName,
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
  }

  return crypto.subtle.generateKey(
    {
      name: algorithmName,
    },
    true,
    ['sign', 'verify'],
  );
};

const createActorKeyPair = async (
  algorithmName: 'RSASSA-PKCS1-v1_5' | 'Ed25519',
  ids: { cryptographicKey: string; multikey: string },
): Promise<ActorKeyPair> => {
  const { privateKey, publicKey } = await generateKeyPair(algorithmName);

  return {
    publicKey,
    privateKey,
    cryptographicKey: new CryptographicKey({
      id: new URL(ids.cryptographicKey),
      owner: actorUri,
      publicKey,
    }),
    keyId: new URL(ids.cryptographicKey),
    multikey: new Multikey({
      id: new URL(ids.multikey),
      controller: actorUri,
      publicKey,
    }),
  };
};

describe('createLocalProfilePerson', () => {
  it('maps a local profile and actor key pairs into the public Person document', async () => {
    const person = createLocalProfilePerson({
      actorUri,
      inboxUri: new URL(`${actorUri.href}/inbox`),
      outboxUri: new URL(`${actorUri.href}/outbox`),
      profileUri: new URL('https://kosmo.test/@alice'),
      profile: {
        id: '018f4b7c-1111-7222-8333-944455556666',
        handle: 'alice',
        name: 'Alice Example',
        bio: 'Distributed systems notes',
        createdAt: Temporal.Instant.from('2026-01-02T03:04:05Z'),
      },
      keyPairs: [
        await createActorKeyPair('RSASSA-PKCS1-v1_5', {
          cryptographicKey:
            'https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666#main-key',
          multikey: 'https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666#multikey-1',
        }),
        await createActorKeyPair('Ed25519', {
          cryptographicKey:
            'https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666#key-2',
          multikey: 'https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666#multikey-2',
        }),
      ],
    });

    expect(person.id?.href).toBe(actorUri.href);
    expect(person.preferredUsername).toBe('alice');
    expect(person.name?.toString()).toBe('Alice Example');
    expect(person.summary?.toString()).toBe('Distributed systems notes');
    expect(person.url?.href).toBe('https://kosmo.test/@alice');
    expect(person.published?.toString()).toBe('2026-01-02T03:04:05Z');
    expect(person.inboxId?.href).toBe(`${actorUri.href}/inbox`);
    expect(person.outboxId?.href).toBe(`${actorUri.href}/outbox`);
    expect(person.publicKeyId?.href).toBe(`${actorUri.href}#main-key`);
    expect(person.assertionMethodIds.map((id) => id.href)).toEqual([`${actorUri.href}#multikey-2`]);
    expect(person.followersId).toBeNull();
    expect(person.followingId).toBeNull();
    expect(person.endpoints).toBeNull();
  });

  it('fails loudly when a key set lacks the HTTP signature RSA key', async () => {
    const ed25519KeyPair = await createActorKeyPair('Ed25519', {
      cryptographicKey: `${actorUri.href}#key-2`,
      multikey: `${actorUri.href}#multikey-2`,
    });

    expect(() =>
      createLocalProfilePerson({
        actorUri,
        inboxUri: new URL(`${actorUri.href}/inbox`),
        outboxUri: new URL(`${actorUri.href}/outbox`),
        profileUri: new URL('https://kosmo.test/@alice'),
        profile: {
          id: '018f4b7c-1111-7222-8333-944455556666',
          handle: 'alice',
          name: 'Alice Example',
          bio: null,
          createdAt: Temporal.Instant.from('2026-01-02T03:04:05Z'),
        },
        keyPairs: [ed25519KeyPair],
      }),
    ).toThrow('RSA');
  });
});
