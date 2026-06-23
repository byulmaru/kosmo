const actorPathPrefix = '/ap/actor/';
const webFingerPath = '/.well-known/webfinger';

export function isFederationRequestPath(pathname: string): boolean {
  return pathname === webFingerPath || pathname.startsWith(actorPathPrefix);
}
