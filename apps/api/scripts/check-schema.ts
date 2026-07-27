import { readFile } from 'node:fs/promises';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { schema } from '../src/graphql/schema';

const schemaPath = new URL('../schema.graphql', import.meta.url);
const committedSchema = await readFile(schemaPath, 'utf8');
const generatedSchema = `${printSchema(lexicographicSortSchema(schema))}\n`;

if (committedSchema !== generatedSchema) {
  console.error(
    'apps/api/schema.graphql does not match the lexicographically sorted runtime schema.',
  );
  process.exitCode = 1;
}
