import assert from 'node:assert/strict';
import test from 'node:test';
import {
  explicitlyHarmfulProfileHandleValues,
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

test('Local Profile handle schema rejects every Explicitly Harmful value after policy normalization', () => {
  for (const handle of explicitlyHarmfulProfileHandleValues) {
    const result = localProfileHandleSchema.safeParse(`  ${handle.toUpperCase()}  `);

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

test('Profile handle policy rejects underscore and numeric evasions for every harmful value', () => {
  const numericSubstitutions = [
    ['a', '4'],
    ['e', '3'],
    ['i', '1'],
    ['o', '0'],
  ] as const;
  const observedNumericReplacements = new Set<string>();

  for (const handle of explicitlyHarmfulProfileHandleValues) {
    const underscoreVariant = [...handle].join('_');
    assert.equal(
      localProfileHandleSchema.safeParse(underscoreVariant).success,
      false,
      underscoreVariant,
    );
    assert.equal(
      profileHandlePolicyViolation(underscoreVariant),
      'explicitly-harmful',
      underscoreVariant,
    );

    for (const [source, replacement] of numericSubstitutions) {
      if (!handle.includes(source)) {
        continue;
      }

      const numericVariant = handle.replaceAll(source, replacement);
      observedNumericReplacements.add(replacement);
      assert.equal(
        localProfileHandleSchema.safeParse(numericVariant).success,
        false,
        numericVariant,
      );
      assert.equal(
        profileHandlePolicyViolation(numericVariant),
        'explicitly-harmful',
        numericVariant,
      );
    }
  }

  assert.deepEqual([...observedNumericReplacements].sort(), ['0', '1', '3', '4']);
});

test('Profile handle policy allows non-matching substrings and ordinary words', () => {
  for (const handle of ['supporter', 'cybersecurity', 'administrator_dev', 'class', 'analysis']) {
    assert.equal(localProfileHandleSchema.safeParse(handle).success, true, handle);
    assert.equal(profileHandlePolicyViolation(handle), undefined, handle);
  }
});
