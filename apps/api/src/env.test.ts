import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { envSchema } from './env';

describe('API startup environment', () => {
  it('parses absent, empty, and blank CSV values as an empty list', () => {
    for (const input of [
      {},
      { KOSMO_LOCAL_TIMELINE_INSTANCE_IDS: '' },
      { KOSMO_LOCAL_TIMELINE_INSTANCE_IDS: ' \t, , \n' },
    ]) {
      assert.deepEqual(envSchema.parse(input).KOSMO_LOCAL_TIMELINE_INSTANCE_IDS, []);
    }
  });

  it('trims and validates UUIDs in a CSV value', () => {
    const instanceIds = [randomUUID(), randomUUID()];
    const expected = [instanceIds[0].toUpperCase(), instanceIds[1]];
    const result = envSchema.parse({
      KOSMO_LOCAL_TIMELINE_INSTANCE_IDS: ` , ${expected[0]} , , ${expected[1]} , `,
    });

    assert.deepEqual(result.KOSMO_LOCAL_TIMELINE_INSTANCE_IDS, expected);
  });

  it('rejects malformed UUIDs with the environment variable in the error path', () => {
    assert.throws(
      () => envSchema.parse({ KOSMO_LOCAL_TIMELINE_INSTANCE_IDS: 'not-a-uuid' }),
      /KOSMO_LOCAL_TIMELINE_INSTANCE_IDS/,
    );
  });
});
