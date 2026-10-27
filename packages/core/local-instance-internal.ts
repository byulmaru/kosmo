import { InstanceKind, InstanceState } from './enums';
import type { Instances } from './db/tables';

export class LocalInstanceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalInstanceConfigurationError';
  }
}

export type LocalInstanceConfig = {
  canonicalOrigin: string;
  domain: string;
};

type LocalInstanceRow = Pick<
  typeof Instances.$inferSelect,
  'canonicalOrigin' | 'createdAt' | 'domain' | 'id' | 'kind' | 'state' | 'updatedAt'
>;

export type ConfiguredLocalInstance = Omit<LocalInstanceRow, 'canonicalOrigin'> & {
  canonicalOrigin: string;
};

export type LocalInstanceOptions = {
  publicOrigin?: string;
};

export const parseLocalInstanceConfig = ({
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

export const validateConfiguredLocalInstance = (
  instance: LocalInstanceRow | undefined,
  config: LocalInstanceConfig,
): ConfiguredLocalInstance => {
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

  return {
    canonicalOrigin: instance.canonicalOrigin,
    createdAt: instance.createdAt,
    domain: instance.domain,
    id: instance.id,
    kind: instance.kind,
    state: instance.state,
    updatedAt: instance.updatedAt,
  };
};
