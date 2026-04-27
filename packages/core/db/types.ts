import { customType } from 'drizzle-orm/pg-core';
import { Temporal } from 'temporal-polyfill';

export const datetime = customType<{ data: Temporal.Instant; driverData: Date }>({
  dataType: () => 'timestamp with time zone',
  fromDriver: (value) => Temporal.Instant.fromEpochMilliseconds(value.getTime()),
  toDriver: (value) => new Date(value.epochMilliseconds),
});
