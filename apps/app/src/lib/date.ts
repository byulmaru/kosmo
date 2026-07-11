import {
  formatDate,
  formatTimelineTimestamp as formatTemporalTimelineTimestamp,
} from '@kosmo/core/datetime';
import { Temporal } from 'temporal-polyfill';

export function formatTimelineTimestamp(
  value: string,
  now: Temporal.Instant = Temporal.Now.instant(),
): string {
  return formatTemporalTimelineTimestamp(Temporal.Instant.from(value), now);
}

export function formatPostDate(value: string): string {
  const instant = Temporal.Instant.from(value);
  const time = instant.toLocaleString('ko-KR', { timeStyle: 'short' });
  return `${time} · ${formatDate(instant)}`;
}
