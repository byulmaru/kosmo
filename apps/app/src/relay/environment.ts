import { Environment, Network, RecordSource, ROOT_TYPE, Store } from 'relay-runtime';
import { captureHandledMessage } from '@/observability/sentry';
import { executeGraphQLRequest } from './network';
import type { MissingFieldHandler, RelayFieldLogger } from 'relay-runtime';
import type { NativeStartupRecovery } from './nativeStartupRecovery';

const MISSING_EXPECTED_DATA_KIND = 'missing_expected_data.log';
const RELAY_MISSING_EXPECTED_DATA_MESSAGE = 'Relay missing expected data';
type RelayFieldLoggerEvent = Parameters<RelayFieldLogger>[0];

const postNodeMissingFieldHandler: MissingFieldHandler = {
  kind: 'linked',
  handle(field, parentRecord, args, store) {
    const id = args.id;
    if (
      parentRecord?.getType() !== ROOT_TYPE ||
      field.name !== 'node' ||
      typeof id !== 'string' ||
      store.get(id)?.getType() !== 'Post'
    ) {
      return undefined;
    }
    return id;
  },
};

export function createRelayEnvironment(
  token: string | null,
  selectedProfileId: string | null = null,
  startupRecovery?: NativeStartupRecovery | null,
): Environment {
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
    network: Network.create((request, variables, cacheConfig) =>
      executeGraphQLRequest(
        request,
        variables,
        token,
        fetch,
        selectedProfileId,
        cacheConfig.metadata?.nativeStartup === true ? startupRecovery : undefined,
      ),
    ),
    missingFieldHandlers: [postNodeMissingFieldHandler],
    relayFieldLogger,
    store: new Store(new RecordSource()),
  });
}
