export const mapErrorToNull = <T>(array: (T | Error)[]): (T | null)[] =>
  array.map((item) => (item instanceof Error ? null : item));
