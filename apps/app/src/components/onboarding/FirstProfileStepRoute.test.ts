import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { initialFirstProfileDraft } from './firstProfileOnboardingState';
import type { ReactTestRenderer } from 'react-test-renderer';
import type FirstProfileStepRoute from '../../app/first-profile/[step]';
import type { createFirstProfileOnboardingAnalytics } from './firstProfileOnboardingAnalytics';
import type { useFirstProfileOnboarding } from './FirstProfileOnboardingRoute';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let focused = true;
let step = 'details';
let renderer: ReactTestRenderer | undefined;
let flow: ReturnType<typeof useFirstProfileOnboarding>;
let Route: typeof FirstProfileStepRoute;
let createAnalytics: typeof createFirstProfileOnboardingAnalytics;
const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', {
  Redirect: () => null,
  useLocalSearchParams: () => ({ step }),
  useRouter: () => ({ push: () => undefined }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    useEffect(() => {
      if (focused) {
        return effect();
      }
    }, [effect, focused]);
  },
});
mockModule('expo-router/react-navigation', { usePreventRemove: () => undefined });
mockModule('@/components/onboarding/FirstProfileOnboardingRoute', {
  useFirstProfileOnboarding: () => flow,
});
mockModule('@/components/onboarding/FirstProfileOnboardingScreen', {
  FirstProfileOnboardingScreen: () => null,
});
mockModule('@/analytics/client', {
  trackAnalyticsForAccount: (
    _accountId: string,
    event: string,
    properties: Record<string, unknown>,
  ) => events.push({ event, properties }),
  setPendingOnboardingHomeView: () => undefined,
});

before(async () => {
  ({ default: Route } = await import('../../app/first-profile/[step]'));
  ({ createFirstProfileOnboardingAnalytics: createAnalytics } =
    await import('./firstProfileOnboardingAnalytics'));
});
beforeEach(() => {
  focused = true;
  step = 'details';
  events.length = 0;
  flow = {
    analytics: createAnalytics('account-1'),
    busy: false,
    profileSelected: true,
    createdProfile: { id: 'profile-1', handle: 'spring' },
    draft: initialFirstProfileDraft,
    errors: {},
    images: {
      avatar: {
        asset: null,
        generation: 0,
        mediaId: null,
        presentation: { kind: 'current', previewUri: null },
      },
      header: {
        asset: null,
        generation: 0,
        mediaId: null,
        presentation: { kind: 'current', previewUri: null },
      },
    },
    result: { kind: 'idle' },
    complete: () => undefined,
    next: () => undefined,
    skip: () => undefined,
    setDraft: () => undefined,
    pickImage: async () => undefined,
    removeImage: () => undefined,
    retryImage: () => undefined,
  };
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});
async function render() {
  await act(async () => {
    if (renderer) {
      renderer.update(createElement(Route));
    } else {
      renderer = create(createElement(Route));
    }
  });
}

test('records returning to a retained step as another visit without counting rerenders', async () => {
  await render();
  flow = { ...flow, busy: true };
  await render();
  focused = false;
  await render();
  focused = true;
  await render();
  assert.deepEqual(
    events
      .filter(({ event }) => event === 'first_profile_onboarding_step_viewed')
      .map(({ properties }) => [properties.step, properties.visit_sequence]),
    [
      ['details', 1],
      ['details', 2],
    ],
  );
});

test('records only valid focused input steps and starts a handle flow once', async () => {
  focused = false;
  step = 'handle';
  await render();
  assert.equal(events.length, 0);
  focused = true;
  await render();
  focused = false;
  await render();
  focused = true;
  await render();
  step = 'unknown';
  await render();
  step = 'complete';
  await render();
  step = 'details';
  flow = { ...flow, profileSelected: false };
  await render();
  assert.equal(
    events.filter(({ event }) => event === 'first_profile_onboarding_started').length,
    1,
  );
  assert.deepEqual(
    events
      .filter(({ event }) => event === 'first_profile_onboarding_step_viewed')
      .map(({ properties }) => [properties.step, properties.visit_sequence]),
    [
      ['handle', 1],
      ['handle', 2],
    ],
  );
});
