import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { CoachmarkMetadataKey } from './CoachmarkGuide';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as CoachmarkControllerModule from './CoachmarkController';
import type * as CoachmarkProviderModule from './CoachmarkProvider';

type CoachmarkRequest = CoachmarkProviderModule.CoachmarkRequest;
type CoachmarkStep = CoachmarkProviderModule.CoachmarkStep;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type AccountFixture = {
  id: string;
  profiles: Array<{ id: string }>;
  metadata: Array<{ key: string; value: string }>;
};

const account: AccountFixture = {
  id: 'account-1',
  profiles: [{ id: 'profile-1' }],
  metadata: [],
};
const session = { status: 'valid' as 'guest' | 'valid' };
const commitCalls: Array<{ options: Record<string, unknown> }> = [];
const reportCalls: unknown[] = [];
const commitRecord = (options: Record<string, unknown>) => {
  commitCalls.push({ options });
};
const reportUnexpectedError = (error: unknown) => reportCalls.push(error);
let requestFromProvider: ((request: CoachmarkRequest) => { cancel: () => void } | null) | null =
  null;
let renderer: ReactTestRenderer | null = null;
let autoStartEffectRuns = 0;
let autoStartEffectCancellations = 0;
let currentControllerSteps = [createStep('첫 대상')];
let CoachmarkProvider: typeof CoachmarkProviderModule.CoachmarkProvider;
let useCoachmark: typeof CoachmarkProviderModule.useCoachmark;
let useCoachmarkController: typeof CoachmarkControllerModule.useCoachmarkController;

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('../ui/Coachmark.tsx', {
  Coachmark: (props: Record<string, unknown>) => createElement('Coachmark', props),
});
mockModule('react-relay', {
  graphql: (parts: TemplateStringsArray) => parts.join(''),
  useFragment: (_fragment: unknown, key: AccountFixture | null | undefined) => key ?? null,
  useMutation: () => [commitRecord],
});
mockModule('@/session/SessionProvider', {
  useSession: () => session,
});
mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => reportUnexpectedError,
});

function createStep(description = '설명을 확인하세요.'): CoachmarkStep {
  return {
    anchorRef: { current: null },
    description,
    title: '안내',
  };
}

const stableAutoStartSteps = [createStep()];

function ProviderProbe() {
  const { request } = useCoachmark();
  useEffect(() => {
    requestFromProvider = request;
    return () => {
      requestFromProvider = null;
    };
  }, [request]);
  return null;
}

function ControllerProbe({ accountKey = account }: { accountKey?: AccountFixture | null }) {
  const controller = useCoachmarkController({
    account: accountKey as never,
    guide: 'TIMELINE',
    ready: true,
    steps: [createStep()],
  });
  return createElement('ControllerProbe', {
    open: controller.open,
    requestAutoStart: controller.requestAutoStart,
  });
}

function AutoStartEffectProbe() {
  const controller = useCoachmarkController({
    account: account as never,
    guide: 'TIMELINE',
    ready: true,
    steps: stableAutoStartSteps,
  });
  useEffect(() => {
    autoStartEffectRuns += 1;
    // Later runs do not request again, so an identity regression cannot create an unbounded loop.
    const handle = autoStartEffectRuns === 1 ? controller.requestAutoStart() : null;
    return () => {
      autoStartEffectCancellations += 1;
      handle?.cancel();
    };
  }, [controller.requestAutoStart]);
  return null;
}

function FreshStepsProbe() {
  const controller = useCoachmarkController({
    account: account as never,
    guide: 'TIMELINE',
    ready: true,
    steps: () => currentControllerSteps,
  });
  return createElement('ControllerProbe', {
    open: controller.open,
    requestAutoStart: controller.requestAutoStart,
  });
}

async function renderProvider(
  children: ReactNode = createElement(ProviderProbe),
  accountId: string | null = null,
) {
  await act(async () => {
    renderer = create(createElement(CoachmarkProvider, { accountId, children }));
  });
}

before(async () => {
  ({ CoachmarkProvider, useCoachmark } = await import('./CoachmarkProvider'));
  ({ useCoachmarkController } = await import('./CoachmarkController'));
});

beforeEach(() => {
  account.metadata = [];
  account.profiles = [{ id: 'profile-1' }];
  session.status = 'valid';
  commitCalls.length = 0;
  reportCalls.length = 0;
  autoStartEffectRuns = 0;
  autoStartEffectCancellations = 0;
  currentControllerSteps = [createStep('첫 대상')];
  requestFromProvider = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

test('provider keeps one guide active and requires an explicit retry after a busy rejection', async () => {
  await renderProvider();

  assert.equal(
    requestFromProvider?.({
      guide: 'TIMELINE',
      mode: 'manual',
      ready: false,
      steps: [createStep()],
    }),
    null,
  );

  let first: { cancel: () => void } | null | undefined;
  let competing: { cancel: () => void } | null | undefined;
  await act(async () => {
    first = requestFromProvider?.({
      guide: 'TIMELINE',
      mode: 'manual',
      ready: true,
      steps: [createStep()],
    });
    competing = requestFromProvider?.({
      guide: 'SEARCH',
      mode: 'manual',
      ready: true,
      steps: [createStep('다른 안내')],
    });
  });
  assert.ok(first);
  assert.equal(competing, null);

  await act(async () => first?.cancel());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 0);

  let retried: { cancel: () => void } | null | undefined;
  await act(async () => {
    retried = requestFromProvider?.({
      guide: 'SEARCH',
      mode: 'manual',
      ready: true,
      steps: [createStep('다른 안내')],
    });
  });
  assert.ok(retried);
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.description, '다른 안내');
  await act(async () => retried?.cancel());
});

test('a request can be cancelled before its state commit without cancelling its replacement', async () => {
  await renderProvider();

  let first: ReturnType<NonNullable<typeof requestFromProvider>> = null;
  let replacement: ReturnType<NonNullable<typeof requestFromProvider>> = null;
  await act(async () => {
    first =
      requestFromProvider?.({
        guide: 'TIMELINE',
        mode: 'manual',
        ready: true,
        steps: [createStep('첫 안내')],
      }) ?? null;
    first?.cancel();
    replacement =
      requestFromProvider?.({
        guide: 'SEARCH',
        mode: 'manual',
        ready: true,
        steps: [createStep('대체 안내')],
      }) ?? null;
  });

  assert.ok(replacement);
  await act(async () => first?.cancel());
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.description, '대체 안내');
  await act(async () => replacement?.cancel());
});

test('provider keeps the presentation mounted while a visible guide exits', async () => {
  await renderProvider();
  let handle: ReturnType<NonNullable<typeof requestFromProvider>> = null;
  await act(async () => {
    handle =
      requestFromProvider?.({
        guide: 'TIMELINE',
        mode: 'manual',
        ready: true,
        steps: [createStep()],
      }) ?? null;
  });
  assert.ok(handle);

  const coachmark = renderer?.root.findByType('Coachmark' as never);
  await act(async () => coachmark?.props.onClose());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
  assert.equal(renderer?.root.findByType('Coachmark' as never), coachmark);
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.visible, false);

  assert.equal(
    requestFromProvider?.({
      guide: 'SEARCH',
      mode: 'manual',
      ready: true,
      steps: [createStep('다음 안내')],
    }),
    null,
  );
  await act(async () => coachmark?.props.onExited?.());

  let next: ReturnType<NonNullable<typeof requestFromProvider>> = null;
  await act(async () => {
    next =
      requestFromProvider?.({
        guide: 'SEARCH',
        mode: 'manual',
        ready: true,
        steps: [createStep('다음 안내')],
      }) ?? null;
  });
  assert.ok(next);
  await act(async () => next?.cancel());
});

test('automatic start requires a usable profile and records only after the first step is shown', async () => {
  await renderProvider(createElement(ControllerProbe));
  const probe = () => renderer?.root.findByType('ControllerProbe' as never).props;

  await act(async () => probe()?.requestAutoStart());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
  assert.equal(commitCalls.length, 0);

  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onShown());
  assert.equal(commitCalls.length, 1);
  assert.deepEqual(commitCalls[0]?.options.variables, {
    input: { key: CoachmarkMetadataKey.TIMELINE, value: 'true' },
  });

  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onClose());
  await act(async () => probe()?.requestAutoStart());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.visible, false);
});

test('automatic start effect keeps its request callback stable while the guide opens', async () => {
  await renderProvider(createElement(AutoStartEffectProbe));

  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onShown());
  assert.equal(commitCalls.length, 1);
  assert.equal(autoStartEffectRuns, 1);
  assert.equal(autoStartEffectCancellations, 0);
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
});

test('manual requests resolve the current target steps at request time', async () => {
  await renderProvider(createElement(FreshStepsProbe));
  const probe = () => renderer?.root.findByType('ControllerProbe' as never).props;

  await act(async () => probe()?.open());
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.description, '첫 대상');
  const first = renderer?.root.findByType('Coachmark' as never);
  await act(async () => first?.props.onClose());
  await act(async () => first?.props.onExited?.());

  currentControllerSteps = [createStep('현재 대상')];
  await act(async () => probe()?.open());
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.description, '현재 대상');
});

test('metadata marked as shown suppresses automatic start while manual help remains available', async () => {
  account.metadata = [{ key: CoachmarkMetadataKey.TIMELINE, value: 'true' }];
  await renderProvider(createElement(ControllerProbe));
  const probe = () => renderer?.root.findByType('ControllerProbe' as never).props;

  await act(async () => probe()?.requestAutoStart());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 0);

  await act(async () => probe()?.open());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onShown());
  assert.equal(commitCalls.length, 1);
});

test('manual multi-step help moves both ways and restarts from the first step', async () => {
  await renderProvider();
  const steps = [createStep('첫 단계'), createStep('두 번째 단계')];
  let handle: ReturnType<NonNullable<typeof requestFromProvider>> = null;

  await act(async () => {
    handle =
      requestFromProvider?.({
        guide: 'TIMELINE',
        mode: 'manual',
        ready: true,
        steps,
      }) ?? null;
  });
  assert.ok(handle);

  let coachmark = renderer?.root.findByType('Coachmark' as never);
  assert.deepEqual(coachmark?.props.progress, { current: 1, total: 2 });
  assert.equal(coachmark?.props.onPrevious, undefined);
  assert.ok(coachmark?.props.onNext);

  await act(async () => coachmark?.props.onNext());
  coachmark = renderer?.root.findByType('Coachmark' as never);
  assert.deepEqual(coachmark?.props.progress, { current: 2, total: 2 });
  assert.ok(coachmark?.props.onPrevious);
  assert.equal(coachmark?.props.onNext, undefined);

  await act(async () => coachmark?.props.onPrevious());
  coachmark = renderer?.root.findByType('Coachmark' as never);
  assert.deepEqual(coachmark?.props.progress, { current: 1, total: 2 });

  await act(async () => coachmark?.props.onNext());
  coachmark = renderer?.root.findByType('Coachmark' as never);
  assert.equal(coachmark?.props.onNext, undefined);
  await act(async () => coachmark?.props.onComplete());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.visible, false);

  assert.equal(
    requestFromProvider?.({
      guide: 'TIMELINE',
      mode: 'manual',
      ready: true,
      steps,
    }),
    null,
  );
  await act(async () => coachmark?.props.onExited?.());

  let restarted: ReturnType<NonNullable<typeof requestFromProvider>> = null;
  await act(async () => {
    restarted =
      requestFromProvider?.({
        guide: 'TIMELINE',
        mode: 'manual',
        ready: true,
        steps,
      }) ?? null;
  });
  assert.ok(restarted);
  assert.deepEqual(renderer?.root.findByType('Coachmark' as never).props.progress, {
    current: 1,
    total: 2,
  });
  await act(async () => restarted?.cancel());
});

test('a shown automatic guide suppresses a later retry for the same account', async () => {
  await renderProvider();
  const request = (guide: CoachmarkRequest['guide']) =>
    requestFromProvider?.({
      accountId: account.id,
      guide,
      mode: 'automatic',
      ready: true,
      steps: [createStep()],
    });

  let active: ReturnType<typeof request>;
  let duplicate: ReturnType<typeof request>;
  await act(async () => {
    active = request('TIMELINE');
  });
  assert.ok(active);
  await act(async () => {
    duplicate = request('TIMELINE');
  });
  assert.equal(duplicate, null);
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);

  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onShown());
  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onClose());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.visible, false);
  assert.equal(request('TIMELINE'), null);
});

test('automatic transient history stays scoped to the account', async () => {
  await renderProvider();
  const request = (accountId: string) =>
    requestFromProvider?.({
      accountId,
      guide: 'TIMELINE',
      mode: 'automatic',
      ready: true,
      steps: [createStep()],
    });

  let first: ReturnType<typeof request>;
  await act(async () => {
    first = request('account-1');
  });
  assert.ok(first);
  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onShown());
  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onClose());

  assert.equal(request('account-1'), null);
  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onExited?.());
  let otherAccount: ReturnType<typeof request>;
  await act(async () => {
    otherAccount = request('account-2');
  });
  assert.ok(otherAccount);
  await act(async () => otherAccount?.cancel());
});

test('account changes clear requests and stale handles cannot affect the new account', async () => {
  await renderProvider(createElement(ProviderProbe), 'account-1');

  let oldAccountRequest: ReturnType<NonNullable<typeof requestFromProvider>> = null;
  await act(async () => {
    oldAccountRequest =
      requestFromProvider?.({
        accountId: 'account-1',
        guide: 'TIMELINE',
        mode: 'automatic',
        ready: true,
        steps: [createStep('이전 계정 안내')],
      }) ?? null;
  });
  assert.ok(oldAccountRequest);

  await act(async () => {
    renderer?.update(
      createElement(CoachmarkProvider, {
        accountId: 'account-2',
        children: createElement(ProviderProbe),
      }),
    );
  });
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 0);

  let newAccountRequest: ReturnType<NonNullable<typeof requestFromProvider>> = null;
  await act(async () => {
    newAccountRequest =
      requestFromProvider?.({
        accountId: 'account-2',
        guide: 'SEARCH',
        mode: 'manual',
        ready: true,
        steps: [createStep('현재 계정 안내')],
      }) ?? null;
  });
  assert.ok(newAccountRequest);

  await act(async () => oldAccountRequest?.cancel());
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.description, '현재 계정 안내');

  await act(async () => {
    renderer?.update(
      createElement(CoachmarkProvider, {
        accountId: 'account-1',
        children: createElement(ProviderProbe),
      }),
    );
  });
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 0);

  await act(async () => newAccountRequest?.cancel());
});

test('controller callbacks from the previous account reject synchronously', async () => {
  const nextAccount: AccountFixture = {
    id: 'account-2',
    profiles: [{ id: 'profile-2' }],
    metadata: [],
  };
  await renderProvider(createElement(ControllerProbe), account.id);
  const previous = renderer?.root.findByType('ControllerProbe' as never).props;

  await act(async () => {
    renderer?.update(
      createElement(CoachmarkProvider, {
        accountId: nextAccount.id,
        children: createElement(ControllerProbe, { accountKey: nextAccount }),
      }),
    );
  });

  assert.equal(previous?.open(), null);
  assert.equal(previous?.requestAutoStart(), null);

  await act(async () => {
    renderer?.update(
      createElement(CoachmarkProvider, {
        accountId: account.id,
        children: createElement(ControllerProbe, { accountKey: account }),
      }),
    );
  });
  assert.equal(previous?.open(), null);
  assert.equal(previous?.requestAutoStart(), null);

  let current: ReturnType<NonNullable<typeof requestFromProvider>> = null;
  await act(async () => {
    current = renderer?.root.findByType('ControllerProbe' as never).props.open() ?? null;
  });
  assert.ok(current);
  await act(async () => current?.cancel());
});

test('manual help starts for guests and accounts without profiles', async () => {
  session.status = 'guest';
  account.profiles = [];
  await renderProvider(createElement(ControllerProbe, { accountKey: null }));
  const probe = () => renderer?.root.findByType('ControllerProbe' as never).props;

  await act(async () => probe()?.requestAutoStart());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 0);
  await act(async () => probe()?.open());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
  assert.equal(commitCalls.length, 0);

  await act(async () => renderer?.unmount());
  renderer = null;
  session.status = 'valid';
  await renderProvider(createElement(ControllerProbe));
  const accountProbe = () => renderer?.root.findByType('ControllerProbe' as never).props;

  await act(async () => accountProbe()?.open());
  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onShown());
  assert.equal(commitCalls.length, 1);
});
