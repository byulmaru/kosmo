import { createFederation, Endpoints, MemoryKvStore, Person } from '@fedify/fedify';
import { db, first, Profiles } from '../db';
import { eq } from 'drizzle-orm';

export const federation = createFederation<unknown>({
  kv: new MemoryKvStore(),
});

federation.setActorDispatcher('/profile/{identifier}', async (ctx, identifier) => {
  console.log(identifier);

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
    .where(eq(Profiles.id, identifier))
    .then(first);

  if (!profile) {
    return null;
  }

  return new Person({
    id: new URL(profile.uri),
    preferredUsername: profile.handle,
    name: profile.displayName,
    inbox: new URL(profile.inboxUri),
    endpoints: new Endpoints({
      sharedInbox: new URL(profile.sharedInboxUri!),
    }),
    url: new URL(profile.url ?? profile.uri),
  });
});

federation.setInboxListeners('/profile/{identifier}/inbox', '/inbox');
