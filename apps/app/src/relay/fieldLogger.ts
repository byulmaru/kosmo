import { captureHandledMessage } from '@/observability/sentry';
import type { RelayFieldLogger } from 'relay-runtime';

const MISSING_EXPECTED_DATA_KIND = 'missing_expected_data.log';
const RELAY_MISSING_EXPECTED_DATA_MESSAGE = 'Relay missing expected data';

type EnvironmentAgeBucket = 'under_5m' | '5m_to_30m' | '30m_to_2h' | 'over_2h';
type RelayFieldLoggerEvent = Parameters<RelayFieldLogger>[0];

const environmentAgeBucket = (ageMilliseconds: number): EnvironmentAgeBucket => {
  const ageMinutes = Math.max(0, ageMilliseconds) / 60_000;

  if (ageMinutes < 5) {
    return 'under_5m';
  }
  if (ageMinutes < 30) {
    return '5m_to_30m';
  }
  if (ageMinutes < 120) {
    return '30m_to_2h';
  }

  return 'over_2h';
};

export function createRelayFieldLogger(
  now: () => number = Date.now,
): (event: RelayFieldLoggerEvent) => void {
  const environmentCreatedAt = now();
  const reportedEvents = new Map<string, Set<string>>();

  return (event) => {
    if (event.kind !== MISSING_EXPECTED_DATA_KIND) {
      return;
    }

    const ownerEvents = reportedEvents.get(event.owner) ?? new Set<string>();
    if (ownerEvents.has(event.fieldPath)) {
      return;
    }
    ownerEvents.add(event.fieldPath);
    reportedEvents.set(event.owner, ownerEvents);

    captureHandledMessage(RELAY_MISSING_EXPECTED_DATA_MESSAGE, {
      relay_kind: event.kind,
      relay_owner: event.owner,
      relay_field_path: event.fieldPath,
      relay_environment_age_bucket: environmentAgeBucket(now() - environmentCreatedAt),
    });
  };
}
