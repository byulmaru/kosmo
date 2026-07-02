import { eq, isNull, or } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

type ProfileInstanceRef = {
  instanceId: string | null;
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

type ProfileInstanceColumns = {
  instanceId: AnyPgColumn;
};

export const isConfiguredLocalProfile = (
  profile: ProfileInstanceRef,
  configuredLocalInstance: Pick<InstanceRef, 'id'>,
) => profile.instanceId === null || profile.instanceId === configuredLocalInstance.id;

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

export const configuredLocalProfileWhere = (
  profile: ProfileInstanceColumns,
  configuredLocalInstanceId: string,
) => or(isNull(profile.instanceId), eq(profile.instanceId, configuredLocalInstanceId))!;
