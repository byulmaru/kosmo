import assert from 'node:assert/strict';
import test from 'node:test';
import {
  explicitlyHarmfulProfileHandleValues,
  profileHandlePolicyErrorMessage,
  profileHandlePolicyViolation,
  profileHandleSchema,
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

test('Profile handle schema rejects every System Reserved value after trim and case folding', () => {
  for (const handle of systemReservedProfileHandleValues) {
    const result = profileHandleSchema.safeParse(`  ${handle.toUpperCase()}  `);

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

test('System Reserved values include every current static app route that is a valid handle', () => {
  for (const handle of currentStaticAppRouteHandleValues) {
    assert.equal(systemReservedProfileHandleValues.includes(handle), true, handle);
    assert.equal(profileHandlePolicyViolation(handle), 'system-reserved', handle);
  }

  for (const route of ['follow-requests', 'profile-edit']) {
    const result = profileHandleSchema.safeParse(route);

    assert.equal(result.success, false, route);
    assert.equal(
      result.success ? undefined : result.error.issues[0]?.code,
      'invalid_format',
      route,
    );
    assert.equal(profileHandlePolicyViolation(route), undefined, route);
  }
});

test('Profile handle schema rejects every Explicitly Harmful value after policy normalization', () => {
  for (const handle of explicitlyHarmfulProfileHandleValues) {
    const result = profileHandleSchema.safeParse(`  ${handle.toUpperCase()}  `);

    assert.equal(result.success, false, handle);
    assert.equal(
      result.success ? undefined : result.error.issues.at(-1)?.message,
      profileHandlePolicyErrorMessage,
      handle,
    );
    assert.equal(
      profileHandlePolicyViolation(`  ${handle.toUpperCase()}  `),
      'explicitly-harmful',
      handle,
    );
  }
});

test('Profile handle policy rejects the specified underscore and numeric evasions', () => {
  for (const handle of ['f_a_g_g_o_t', 'n1gg3r', 'tr4nny', 'p_0_r_n']) {
    assert.equal(profileHandleSchema.safeParse(handle).success, false, handle);
    assert.equal(profileHandlePolicyViolation(handle), 'explicitly-harmful', handle);
  }
});

test('Profile handle policy allows non-matching substrings and ordinary words', () => {
  for (const handle of ['supporter', 'cybersecurity', 'administrator_dev', 'class', 'analysis']) {
    assert.equal(profileHandleSchema.safeParse(handle).success, true, handle);
    assert.equal(profileHandlePolicyViolation(handle), undefined, handle);
  }
});
