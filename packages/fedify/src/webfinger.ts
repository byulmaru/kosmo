export interface AcctResourceParts {
  readonly handle: string;
  readonly domain: string;
}

export interface WebFingerLink {
  readonly rel: string;
  readonly href: string;
  readonly type?: string;
}

export const activityPubSelfLinkRel = 'self' as const;
export const profilePageLinkRel = 'http://webfinger.net/rel/profile-page' as const;

export function formatAcctResource(parts: AcctResourceParts): string {
  return `acct:${parts.handle}@${parts.domain.toLowerCase()}`;
}

export function parseAcctResource(resource: string): AcctResourceParts | null {
  if (!resource.startsWith('acct:')) {
    return null;
  }

  const value = resource.slice('acct:'.length);
  const separatorIndex = value.lastIndexOf('@');

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  return {
    handle: value.slice(0, separatorIndex),
    domain: value.slice(separatorIndex + 1).toLowerCase(),
  };
}

export function createWebFingerSelfLink(actorUri: URL): WebFingerLink {
  return {
    rel: activityPubSelfLinkRel,
    href: actorUri.href,
    type: 'application/activity+json',
  };
}

export function createWebFingerProfilePageLink(profileUri: URL): WebFingerLink {
  return {
    rel: profilePageLinkRel,
    href: profileUri.href,
  };
}
