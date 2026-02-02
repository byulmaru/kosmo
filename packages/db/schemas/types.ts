import { customType } from 'drizzle-orm/pg-core';
import { Temporal } from 'temporal-polyfill';

export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
  toDriver: (value) => value,
  fromDriver: (value) => value,
});

export const datetime = customType<{ data: Temporal.Instant; driverData: string }>({
  dataType: () => 'timestamp with time zone',
  fromDriver: (value) => Temporal.Instant.from(value),
  toDriver: (value) => value.toString(),
});

export const jsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => 'jsonb',
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => value,
});
