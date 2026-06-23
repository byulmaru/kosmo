export const actorPathTemplate = '/ap/actor/{identifier}' as const;

export function formatActorPath(identifier: string): string {
  return `/ap/actor/${encodeURIComponent(identifier)}`;
}

export function formatActorUri(origin: string | URL, identifier: string): URL {
  return new URL(formatActorPath(identifier), origin);
}
