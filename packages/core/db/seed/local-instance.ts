import { eq, isNull } from 'drizzle-orm';
import { InstanceKind, InstanceState } from '../../enums';
import {
  LocalInstanceConfigurationError,
  parseLocalInstanceConfig,
  validateConfiguredLocalInstance,
} from '../../local-instance-internal';
import { Instances, Profiles } from '../tables';
import { first, firstOrThrow, isUniqueViolation } from '../utils';
import type { LocalInstanceOptions } from '../../local-instance-internal';
import type { Database } from '../index';

export const bootstrapConfiguredLocalInstance = async (
  database: Database,
  options: LocalInstanceOptions = {},
) => {
  const config = parseLocalInstanceConfig(options);

  return database.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(Instances)
      .where(eq(Instances.domain, config.domain))
      .limit(1)
      .then(first);

    const instance = existing
      ? validateConfiguredLocalInstance(existing, config)
      : await tx
          .insert(Instances)
          .values({
            canonicalOrigin: config.canonicalOrigin,
            domain: config.domain,
            kind: InstanceKind.LOCAL,
            state: InstanceState.ACTIVE,
          })
          .returning()
          .then(firstOrThrow)
          .catch((error) => {
            if (isUniqueViolation(error)) {
              throw new LocalInstanceConfigurationError(
                'Configured local instance row already exists',
              );
            }

            throw error;
          });

    await tx.update(Profiles).set({ instanceId: instance.id }).where(isNull(Profiles.instanceId));

    return instance;
  });
};
