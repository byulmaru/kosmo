import {
  getProfileOrigin,
  isConfiguredLocalProfile,
  parseProfileHandle,
} from '@kosmo/core/profile';
import type { ParsedProfileHandle } from '@kosmo/core/profile';

type ProfileInstanceRef = {
  instanceId: string;
};

type ProfileHandleRef = ProfileInstanceRef & {
  handle: string;
};

type InstanceRef = {
  domain: string;
  id: string;
};

type RelativeHandleOptions = {
  configuredLocalInstance: InstanceRef;
  profileInstance?: InstanceRef | null;
};

export const formatRelativeHandle = (
  profile: ProfileHandleRef,
  { configuredLocalInstance, profileInstance }: RelativeHandleOptions,
) => {
  if (isConfiguredLocalProfile(profile, configuredLocalInstance)) {
    return `@${profile.handle}`;
  }

  if (!profileInstance || profileInstance.id !== profile.instanceId) {
    throw new Error('Profile instance is required to format a non-local relative handle');
  }

  return `@${profile.handle}@${profileInstance.domain}`;
};

export { getProfileOrigin, isConfiguredLocalProfile, parseProfileHandle };
export type { ParsedProfileHandle };
