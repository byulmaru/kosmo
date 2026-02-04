import { useTranslation } from 'react-i18next';
import { Temporal } from 'temporal-polyfill';

type Props = {
  dateStr: string;
  className?: string;
};

export default function RelativeTime({ dateStr, className }: Props) {
  const { i18n } = useTranslation();
  const timeZone = Temporal.Now.timeZoneId();
  const date = Temporal.Instant.from(dateStr).toZonedDateTimeISO(timeZone);
  const now = Temporal.Now.zonedDateTimeISO(timeZone);
  const timeDiff = now.since(date, { largestUnit: 'hour', smallestUnit: 'second' });
  const calendarDiff = now.toPlainDate().since(date.toPlainDate(), { smallestUnit: 'day' });
  let maxRelativeTime: { value: number; unit: 'day' | 'hour' | 'minute' | 'second' } | undefined;

  if (calendarDiff.days === 0 || timeDiff.hours < 24) {
    if (timeDiff.hours > 0) {
      maxRelativeTime = { value: timeDiff.hours, unit: 'hour' };
    } else if (timeDiff.minutes > 0) {
      maxRelativeTime = { value: timeDiff.minutes, unit: 'minute' };
    } else {
      maxRelativeTime = { value: timeDiff.seconds, unit: 'second' };
    }
  } else if (calendarDiff.days < 7) {
    maxRelativeTime = { value: calendarDiff.days, unit: 'day' };
  }

  if (maxRelativeTime) {
    return (
      <time className={className} dateTime={date.toString()}>
        {new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto', style: 'short' }).format(
          -maxRelativeTime.value,
          maxRelativeTime.unit,
        )}
      </time>
    );
  } else {
    const isSameYear = date.year === now.year;
    return (
      <time className={className} dateTime={date.toString()}>
        {date.toLocaleString(i18n.language, {
          year: isSameYear ? undefined : 'numeric',
          month: 'short',
          day: 'numeric',
        })}
      </time>
    );
  }
}
