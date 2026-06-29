import { eq } from 'drizzle-orm';
import { Instances } from './db/tables';
import { first } from './db/utils';
import {
  parseLocalInstanceConfig,
  validateConfiguredLocalInstance,
} from './local-instance-internal';
import type { Database } from './db';
import type { LocalInstanceOptions } from './local-instance-internal';

let configuredLocalInstancePromise: Promise<typeof Instances.$inferSelect> | undefined;

const loadConfiguredLocalInstance = async (
  database: Database,
  options: LocalInstanceOptions = {},
) => {
  const config = parseLocalInstanceConfig(options);
  const instance = await database
    .select()
    .from(Instances)
    .where(eq(Instances.domain, config.domain))
    .limit(1)
    .then(first);

  return validateConfiguredLocalInstance(instance, config);
};

export const resolveConfiguredLocalInstance = async (
  database: Database,
  options: LocalInstanceOptions = {},
) => {
  if ('publicOrigin' in options) {
    return loadConfiguredLocalInstance(database, options);
  }

  configuredLocalInstancePromise ??= loadConfiguredLocalInstance(database, options);

  return configuredLocalInstancePromise;
};

export type { LocalInstanceOptions };
