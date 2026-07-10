export function formatTimelineTimestamp(value: string): string {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.floor(elapsed / 60_000);

  if (minutes < 1) {
    return '방금';
  }
  if (minutes < 60) {
    return `${minutes}분`;
  }
  if (minutes < 1_440) {
    return `${Math.floor(minutes / 60)}시간`;
  }

  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(date);
}

export function formatPostDate(value: string): string {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(
    date,
  );
  const day = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/\.$/, '');

  return `${time} · ${day}`;
}
