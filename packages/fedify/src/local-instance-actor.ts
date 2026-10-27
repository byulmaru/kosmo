import { Application, CryptographicKey } from '@fedify/vocab';
import type { Context } from '@fedify/fedify';

export const localInstanceActorIdentifier = '~instance';

export const createLocalInstanceApplication = (
  context: Context<void>,
  keyPair: CryptoKeyPair,
): Application => {
  const actorUri = context.getActorUri(localInstanceActorIdentifier);

  return new Application({
    id: actorUri,
    inbox: new URL('/inbox', context.canonicalOrigin),
    outbox: context.getOutboxUri(localInstanceActorIdentifier),
    publicKey: new CryptographicKey({
      id: new URL('#main-key', actorUri),
      owner: actorUri,
      publicKey: keyPair.publicKey,
    }),
  });
};
