export const mapErrorToNull = <T>(array: (T | Error)[]): (T | null)[] =>
  array.map((item) => (item instanceof Error ? null : item));

export const filterNullAndError = <T>(array: (T | Error | null)[]): T[] =>
  array.filter((item) => item !== null && !(item instanceof Error)) as T[];
