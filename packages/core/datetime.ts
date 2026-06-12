import { Temporal } from 'temporal-polyfill';

// 게시글 작성 시각 표시 helper. 컴포넌트마다 ad hoc으로 포맷하지 않고 여기서 정한다.

const relativeTimeFormat = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });

// 경과 시간의 상대시간 표시. Intl.RelativeTimeFormat 출력을 그대로 사용한다
// (0초 "지금", 그 외 "n초 전"/"n분 전"/"n시간 전").
// 클라이언트 시계가 서버보다 늦어 미래 시각이 들어와도 "n초 후"가 되지 않게 0으로 본다.
export const formatRelativeTime = (instant: Temporal.Instant, now = Temporal.Now.instant()) => {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.epochMilliseconds - instant.epochMilliseconds) / 1000),
  );

  if (elapsedSeconds < 60) {
    return relativeTimeFormat.format(-elapsedSeconds, 'second');
  }
  if (elapsedSeconds < 3600) {
    return relativeTimeFormat.format(-Math.floor(elapsedSeconds / 60), 'minute');
  }
  return relativeTimeFormat.format(-Math.floor(elapsedSeconds / 3600), 'hour');
};

// ko-KR 날짜("2026. 04. 27"). 출력 끝 마침표는 Figma 표기에 없으므로 제거한다.
export const formatDate = (instant: Temporal.Instant) =>
  instant
    .toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

// 목록 시간 표시 정책(Figma TimeInfo 67:245): 24시간 미만은 상대시간, 이상은 날짜.
export const formatTimelineTimestamp = (
  instant: Temporal.Instant,
  now = Temporal.Now.instant(),
) => {
  const elapsedMilliseconds = now.epochMilliseconds - instant.epochMilliseconds;
  return elapsedMilliseconds < 86_400_000 ? formatRelativeTime(instant, now) : formatDate(instant);
};
