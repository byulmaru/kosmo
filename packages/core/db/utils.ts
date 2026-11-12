import { DrizzleQueryError, sql } from 'drizzle-orm';

export const first = <T>(arr: T[]): T | undefined => arr[0];

export const isUniqueViolation = (error: unknown) =>
  error instanceof DrizzleQueryError &&
  error.cause &&
  'code' in error.cause &&
  error.cause.code === '23505';

export const firstOrThrow = <T>(arr: T[]): T => {
  if (arr.length === 0) {
    throw new Error('Not Found');
  }

  return arr[0];
};

export const firstOrThrowWith = (errorThrower: () => unknown) => {
  return <T>(arr: T[]): T => {
    if (arr.length === 0) {
      throw errorThrower();
    }

    return arr[0];
  };
};

export const uuidv7 = (timestamp?: string) =>
  timestamp === undefined
    ? sql<string>`uuidv7()`
    : sql<string>`CASE
        WHEN ${timestamp}::timestamptz >= '1970-01-01 00:00:00+00'::timestamptz
          AND EXTRACT(EPOCH FROM ${timestamp}::timestamptz) * 1000 < 281474976710656
        THEN uuidv7(${timestamp}::timestamptz - clock_timestamp())
        ELSE uuidv7()
      END`;
