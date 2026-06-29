import { bootstrapConfiguredLocalInstance } from './local-instance';
import type { LocalInstanceOptions } from '../../local-instance-internal';

export const seedDatabase = async (options: LocalInstanceOptions = {}) => {
  const localInstance = await bootstrapConfiguredLocalInstance(options);

  return { localInstance };
};
