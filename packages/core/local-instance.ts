import { eq } from 'drizzle-orm';
import { db } from './db';
import { Instances } from './db/tables';
import { first } from './db/utils';
import {
  parseLocalInstanceConfig,
  validateConfiguredLocalInstance,
} from './local-instance-internal';
import type { ConfiguredLocalInstance, LocalInstanceOptions } from './local-instance-internal';

let configuredLocalInstancePromise: Promise<ConfiguredLocalInstance> | undefined;

const loadConfiguredLocalInstance = async (options: LocalInstanceOptions = {}) => {
  const config = parseLocalInstanceConfig(options);
  const instance = await db
    .select({
      canonicalOrigin: Instances.canonicalOrigin,
      createdAt: Instances.createdAt,
      domain: Instances.domain,
      id: Instances.id,
      kind: Instances.kind,
      state: Instances.state,
      updatedAt: Instances.updatedAt,
    })
    .from(Instances)
    .where(eq(Instances.domain, config.domain))
    .limit(1)
    .then(first);

  return validateConfiguredLocalInstance(instance, config);
};

export const resolveConfiguredLocalInstance = async (options: LocalInstanceOptions = {}) => {
  if ('publicOrigin' in options) {
    return loadConfiguredLocalInstance(options);
  }

  configuredLocalInstancePromise ??= loadConfiguredLocalInstance(options).catch((error) => {
    configuredLocalInstancePromise = undefined;
    throw error;
  });

  return configuredLocalInstancePromise;
};

export type { ConfiguredLocalInstance, LocalInstanceOptions };
