import { customType } from 'drizzle-orm/pg-core';

export const datetime = customType<{ data: Temporal.Instant; driverData: string }>({
  dataType: () => 'timestamp with time zone',
  fromDriver: (value) => Temporal.Instant.from(value),
  toDriver: (value) => value.toString(),
});
