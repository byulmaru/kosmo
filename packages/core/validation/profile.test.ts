import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localProfileHandleSchema,
  profileHandlePolicyErrorMessage,
  profileHandlePolicyViolation,
  systemReservedProfileHandleValues,
} from './profile';

const currentStaticAppRouteHandleValues = [
  'bookmarks',
  'compose',
  'feedback',
  'hashtags',
  'home',
  'local',
  'notifications',
  'search',
  'settings',
] as const;

test('Local Profile handle schema rejects every System Reserved value after trim and case folding', () => {
  for (const handle of systemReservedProfileHandleValues) {
    const result = localProfileHandleSchema.safeParse(`  ${handle.toUpperCase()}  `);

    assert.equal(result.success, false, handle);
    assert.equal(
      result.success ? undefined : result.error.issues.at(-1)?.message,
      profileHandlePolicyErrorMessage,
      handle,
    );
    assert.equal(
      profileHandlePolicyViolation(`  ${handle.toUpperCase()}  `),
      'system-reserved',
      handle,
    );
  }
});

test('Local Profile handle schema prioritizes policy feedback for the short reserved handle ap', () => {
  const result = localProfileHandleSchema.safeParse('ap');

  assert.equal(result.success, false);
  if (result.success) {
    return;
  }

  const firstIssue = result.error.issues[0];
  assert.equal(firstIssue?.message, profileHandlePolicyErrorMessage);
});

test('System Reserved values include every current static app route that is a valid handle', () => {
  for (const handle of currentStaticAppRouteHandleValues) {
    assert.equal(systemReservedProfileHandleValues.includes(handle), true, handle);
    assert.equal(profileHandlePolicyViolation(handle), 'system-reserved', handle);
  }

  for (const route of ['follow-requests', 'profile-edit']) {
    const result = localProfileHandleSchema.safeParse(route);

    assert.equal(result.success, false, route);
    assert.equal(
      result.success ? undefined : result.error.issues[0]?.code,
      'invalid_format',
      route,
    );
    assert.equal(profileHandlePolicyViolation(route), undefined, route);
  }
});

test('Local Profile handle schema allows former expression cases', () => {
  for (const handle of ['porn', 'p_o_r_n', 'p0rn']) {
    assert.equal(localProfileHandleSchema.safeParse(handle).success, true, handle);
    assert.equal(profileHandlePolicyViolation(handle), undefined, handle);
  }
});

test('Profile handle policy allows non-matching substrings and ordinary words', () => {
  for (const handle of [
    'supporter',
    'cybersecurity',
    'administrator_dev',
    'a_d_m_i_n',
    'adm1n',
    'class',
    'analysis',
  ]) {
    assert.equal(localProfileHandleSchema.safeParse(handle).success, true, handle);
    assert.equal(profileHandlePolicyViolation(handle), undefined, handle);
  }
});
