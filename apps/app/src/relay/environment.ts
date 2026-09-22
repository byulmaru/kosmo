import { Environment, Network, RecordSource, Store } from 'relay-runtime';
import { captureHandledMessage } from '@/observability/sentry';
import { executeGraphQLRequest } from './network';
import type { RelayFieldLogger } from 'relay-runtime';

const MISSING_EXPECTED_DATA_KIND = 'missing_expected_data.log';
const RELAY_MISSING_EXPECTED_DATA_MESSAGE = 'Relay missing expected data';
type RelayFieldLoggerEvent = Parameters<RelayFieldLogger>[0];

export function createRelayEnvironment(token: string | null): Environment {
  const environmentCreatedAt = Date.now();
  const reportedEvents = new Set<string>();

  const relayFieldLogger = (event: RelayFieldLoggerEvent): void => {
    if (event.kind !== MISSING_EXPECTED_DATA_KIND) {
      return;
    }

    const eventKey = JSON.stringify([event.owner, event.fieldPath]);
    if (reportedEvents.has(eventKey)) {
      return;
    }
    reportedEvents.add(eventKey);

    captureHandledMessage(RELAY_MISSING_EXPECTED_DATA_MESSAGE, {
      relay_kind: event.kind,
      relay_owner: event.owner,
      relay_field_path: event.fieldPath,
      relay_environment_age_ms: Math.max(0, Date.now() - environmentCreatedAt),
    });
  };

  return new Environment({
    network: Network.create((request, variables) =>
      executeGraphQLRequest(request, variables, token),
    ),
    relayFieldLogger,
    store: new Store(new RecordSource()),
  });
}
