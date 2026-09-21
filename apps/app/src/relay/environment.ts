import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { executeGraphQLRequest } from './network';

export function createRelayEnvironment(
  token: string | null,
  selectedProfileId: string | null = null,
): Environment {
  return new Environment({
    network: Network.create((request, variables) =>
      executeGraphQLRequest(request, variables, token, fetch, selectedProfileId),
    ),
    store: new Store(new RecordSource()),
  });
}
