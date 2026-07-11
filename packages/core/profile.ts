import { domainToASCII } from 'node:url';
import { ProfileOrigin } from './enums';
import { normalizeHandle } from './utils';

type InstanceRef = {
  id: string;
};

type ProfileInstanceRef = {
  instanceId: string;
};

export type ParsedProfileHandle =
  | {
      kind: 'local';
      handle: string;
      normalizedHandle: string;
    }
  | {
      kind: 'remote';
      domain: string;
      handle: string;
      normalizedHandle: string;
    };

const normalizeDomain = (domain: string): string | null => {
  const candidate = domain.trim().toLowerCase();

  if (!candidate || /[/?#]/.test(candidate)) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(`https://${candidate}`);
  } catch {
    return null;
  }

  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    return null;
  }

  const hostname = domainToASCII(url.hostname).toLowerCase().replace(/\.$/, '');

  if (!hostname) {
    return null;
  }

  return url.port ? `${hostname}:${url.port}` : hostname;
};

export const parseProfileHandle = (
  input: string,
  { configuredLocalDomain }: { configuredLocalDomain: string },
): ParsedProfileHandle | null => {
  const value = input.trim().replace(/^@/, '');

  if (!value) {
    return null;
  }

  const parts = value.split('@');

  if (parts.length === 1) {
    const handle = parts[0]!;

    return {
      kind: 'local',
      handle,
      normalizedHandle: normalizeHandle(handle),
    };
  }

  if (parts.length !== 2) {
    return null;
  }

  const [handle, rawDomain] = parts;
  const domain = normalizeDomain(rawDomain ?? '');
  const localDomain = normalizeDomain(configuredLocalDomain);

  if (!handle || !domain || !localDomain) {
    return null;
  }

  if (domain === localDomain) {
    return {
      kind: 'local',
      handle,
      normalizedHandle: normalizeHandle(handle),
    };
  }

  return {
    kind: 'remote',
    domain,
    handle,
    normalizedHandle: normalizeHandle(handle),
  };
};

export const isConfiguredLocalProfile = (
  profile: ProfileInstanceRef,
  configuredLocalInstance: InstanceRef,
) => profile.instanceId === configuredLocalInstance.id;

export const getProfileOrigin = (
  profile: ProfileInstanceRef,
  configuredLocalInstance: InstanceRef,
): ProfileOrigin =>
  isConfiguredLocalProfile(profile, configuredLocalInstance)
    ? ProfileOrigin.LOCAL
    : ProfileOrigin.ACTIVITYPUB;
