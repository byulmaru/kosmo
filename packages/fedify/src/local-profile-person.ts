import { Endpoints, Image, Link, Person } from '@fedify/vocab';
import { ProfileFollowPolicy } from '@kosmo/core/enums';
import { isHttpUri } from './activitypub-uri';
import type { ActorKeyPair, Context } from '@fedify/fedify';
import type { LocalProfileActorMedia, LocalProfileActorProfile } from './local-profile-actor';

export interface CreateLocalProfilePersonOptions<TContextData> {
  readonly context: Context<TContextData>;
  readonly profile: LocalProfileActorProfile;
  readonly keyPairs: readonly ActorKeyPair[];
}

const getPublicKeyAlgorithmName = (keyPair: ActorKeyPair): string =>
  keyPair.publicKey.algorithm.name;

const createProfileImage = (media: LocalProfileActorMedia | null): Image | null => {
  if (!media) {
    return null;
  }

  try {
    const url = new URL(media.url);
    return isHttpUri(url) ? new Image({ mediaType: media.mediaType, url }) : null;
  } catch {
    return null;
  }
};

export const createLocalProfilePerson = <TContextData>({
  context,
  keyPairs,
  profile,
}: CreateLocalProfilePersonOptions<TContextData>): Person => {
  const rsaKeyPair = keyPairs.find(
    (keyPair) => getPublicKeyAlgorithmName(keyPair) === 'RSASSA-PKCS1-v1_5',
  );
  const ed25519KeyPairs = keyPairs.filter(
    (keyPair) => getPublicKeyAlgorithmName(keyPair) === 'Ed25519',
  );

  if (rsaKeyPair == null) {
    throw new Error(`Local ActivityPub actor ${profile.id} is missing an RSA key pair.`);
  }

  const actorUri = context.getActorUri(profile.id);
  const actorPathname = actorUri.pathname.replace(/\/$/, '');
  const inboxUri = new URL(`${actorPathname}/inbox`, actorUri);
  const outboxUri = new URL(`${actorPathname}/outbox`, actorUri);
  const featuredUri = context.getFeaturedUri(profile.id);
  const sharedInboxUri = new URL('/inbox', context.canonicalOrigin);
  const profileUri = new URL(`/@${encodeURIComponent(profile.handle)}`, context.canonicalOrigin);
  const migrationSourceAliases = profile.migrationSourceUri
    ? [new URL(profile.migrationSourceUri)]
    : [];
  // Temporary Threads probe: expose both formats for this actor's avatar.
  const avatar =
    profile.id === '019fb763-35f7-717b-937f-7b0f6d90eb3c' &&
    profile.avatar !== null &&
    profile.avatar.url ===
      'https://media.byulma.run/original/u_14abb012-6fd7-4b1f-9acb-1571997643c9.jpg' &&
    profile.avatar.mediaType === 'image/jpeg'
      ? new Image({
          urls: [
            new Link({
              href: new URL(profile.avatar.url.replace(/\.jpg$/, '.webp')),
              mediaType: 'image/webp',
            }),
            new Link({ href: new URL(profile.avatar.url), mediaType: 'image/jpeg' }),
          ],
        })
      : createProfileImage(profile.avatar);

  return new Person({
    id: actorUri,
    icon: avatar,
    image: createProfileImage(profile.header),
    preferredUsername: profile.handle,
    name: profile.name,
    summary: profile.bio,
    url: profileUri,
    published: profile.createdAt,
    inbox: inboxUri,
    outbox: outboxUri,
    followers: context.getFollowersUri(profile.id),
    following: context.getFollowingUri(profile.id),
    featured: featuredUri,
    publicKey: rsaKeyPair.cryptographicKey,
    assertionMethods: ed25519KeyPairs.map((keyPair) => keyPair.multikey),
    manuallyApprovesFollowers: profile.followPolicy === ProfileFollowPolicy.APPROVAL_REQUIRED,
    aliases: migrationSourceAliases,
    endpoints: new Endpoints({ sharedInbox: sharedInboxUri }),
  });
};
