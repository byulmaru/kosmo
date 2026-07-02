export type ActorScopedUriKind = 'inbox' | 'outbox';

export const buildActorScopedUri = (actorUri: URL, kind: ActorScopedUriKind): URL => {
  const pathname = actorUri.pathname.replace(/\/$/, '');
  return new URL(`${pathname}/${kind}`, actorUri);
};
