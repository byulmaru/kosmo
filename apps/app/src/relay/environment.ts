import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { executeGraphQLRequest } from './network';

export function createRelayEnvironment(token: string | null): Environment {
  return new Environment({
    network: Network.create((request, variables) =>
      executeGraphQLRequest(request, variables, token),
    ),
    store: new Store(new RecordSource()),
  });
}
