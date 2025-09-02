import { createSSRRelayEnvironment } from '$lib/relay';

export const load = async ({ fetch }) => {
  return {
    relayEnvironment: createSSRRelayEnvironment(fetch),
  };
};
