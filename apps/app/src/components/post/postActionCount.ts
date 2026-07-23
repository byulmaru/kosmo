export function formatPostActionCount(count: number | undefined, locale?: string) {
  if (count === undefined || !Number.isInteger(count) || count < 0) {
    return undefined;
  }

  return new Intl.NumberFormat(locale, {
    compactDisplay: 'short',
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(count);
}
