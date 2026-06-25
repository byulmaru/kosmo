import { eq, isNull } from 'drizzle-orm';
import { InstanceKind, InstanceState } from '../enums';
import { Instances, Profiles } from './tables';
import { first, firstOrThrow, isUniqueViolation } from './utils';
import type { Database } from './index';

class LocalInstanceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalInstanceConfigurationError';
  }
}

type LocalInstanceConfig = {
  canonicalOrigin: string;
  domain: string;
};

type LocalInstanceOptions = {
  publicOrigin?: string;
};

const parseLocalInstanceConfig = ({
  publicOrigin = process.env.PUBLIC_ORIGIN,
}: LocalInstanceOptions = {}): LocalInstanceConfig => {
  if (!publicOrigin) {
    throw new LocalInstanceConfigurationError('PUBLIC_ORIGIN is required');
  }

  let url: URL;

  try {
    url = new URL(publicOrigin);
  } catch {
    throw new LocalInstanceConfigurationError('PUBLIC_ORIGIN must be a valid URL origin');
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new LocalInstanceConfigurationError(
      'PUBLIC_ORIGIN must not include a path, query, or hash',
    );
  }

  return {
    canonicalOrigin: url.origin,
    domain: url.host.toLowerCase(),
  };
};

const validateConfiguredLocalInstance = (
  instance: typeof Instances.$inferSelect | undefined,
  config: LocalInstanceConfig,
) => {
  if (!instance) {
    throw new LocalInstanceConfigurationError('Configured local instance row is missing');
  }

  if (
    instance.kind !== InstanceKind.LOCAL ||
    instance.state !== InstanceState.ACTIVE ||
    instance.canonicalOrigin !== config.canonicalOrigin
  ) {
    throw new LocalInstanceConfigurationError(
      'Configured local instance row does not match PUBLIC_ORIGIN',
    );
  }

  return instance;
};

export const resolveConfiguredLocalInstance = async (
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
