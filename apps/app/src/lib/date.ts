const relativeTimeFormat = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });

function formatDate(value: Date): string {
  return value
    .toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');
}

export function formatTimelineTimestamp(value: string, now: number | Date = Date.now()): string {
  const date = new Date(value);
  const nowMilliseconds = now instanceof Date ? now.getTime() : now;
  const elapsedSeconds = Math.max(0, Math.floor((nowMilliseconds - date.getTime()) / 1_000));

  if (elapsedSeconds < 60) {
    return relativeTimeFormat.format(-elapsedSeconds, 'second');
  }
  if (elapsedSeconds < 3_600) {
    return relativeTimeFormat.format(-Math.floor(elapsedSeconds / 60), 'minute');
  }
  if (elapsedSeconds < 86_400) {
    return relativeTimeFormat.format(-Math.floor(elapsedSeconds / 3_600), 'hour');
  }

  return formatDate(date);
}

export function formatPostDate(value: string): string {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(
    date,
  );
  return `${time} · ${formatDate(date)}`;
}
