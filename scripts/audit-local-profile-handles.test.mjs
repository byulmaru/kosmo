import assert from 'node:assert/strict';
import test from 'node:test';
import { auditProfileHandleRows } from './audit-local-profile-handles.mjs';

test('audit reports conflicting profile ids and counts without exposing handles', () => {
  const report = auditProfileHandleRows([
    { handle: ' Admin ', id: 'system-profile' },
    { handle: 'n1gg3r', id: 'harmful-profile' },
    { handle: 'supporter', id: 'allowed-profile' },
  ]);

  assert.deepEqual(report, {
    explicitlyHarmfulProfileIds: ['harmful-profile'],
    explicitlyHarmfulProfileCount: 1,
    profileCount: 3,
    systemReservedProfileIds: ['system-profile'],
    systemReservedProfileCount: 1,
  });
  assert.equal(JSON.stringify(report).includes('admin'), false);
  assert.equal(JSON.stringify(report).includes('n1gg3r'), false);
});
