import './enums';
import './objects';
import './resolvers';

import { dev } from '@kosmo/runtime';
import { builder } from './builder';

export const schema = builder.toSchema();

if (dev) {
  const { writeFileSync } = await import('node:fs');
  const { lexicographicSortSchema, printSchema } = await import('graphql');
  writeFileSync('schema.graphql', `${printSchema(lexicographicSortSchema(schema))}\n`);
}
