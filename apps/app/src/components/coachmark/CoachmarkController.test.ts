import assert from 'node:assert/strict';
import { afterEach, before, beforeEach, mock, test } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
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
  seenCoachmarks: string[];
};

const account: AccountFixture = {
  id: 'account-1',
  profiles: [{ id: 'profile-1' }],
  seenCoachmarks: [],
};
const session = { status: 'valid' as 'guest' | 'valid' };
const commitCalls: Array<{ options: Record<string, unknown> }> = [];
const reportCalls: unknown[] = [];
let requestFromProvider: ((request: CoachmarkRequest) => { cancel: () => void } | null) | null =
  null;
let renderer: ReactTestRenderer | null = null;
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
  useMutation: () => [
    (options: Record<string, unknown>) => {
      commitCalls.push({ options });
    },
  ],
});
mockModule('@/session/SessionProvider', {
  useSession: () => session,
});
mockModule('@/observability/UnexpectedErrorContext', {
  useUnexpectedErrorReporter: () => (error: unknown) => reportCalls.push(error),
});

function createStep(description = '설명을 확인하세요.'): CoachmarkStep {
  return {
    anchorRef: { current: null },
    description,
    title: '안내',
  };
}

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
  account.seenCoachmarks = [];
  session.status = 'valid';
  commitCalls.length = 0;
  reportCalls.length = 0;
  requestFromProvider = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

test('provider keeps one guide active and leaves an unready request available for retry', async () => {
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
  await act(async () => {
    first = requestFromProvider?.({
      guide: 'TIMELINE',
      mode: 'manual',
      ready: true,
      steps: [createStep()],
    });
  });
  assert.ok(first);
  let competing: { cancel: () => void } | null | undefined;
  await act(async () => {
    competing = requestFromProvider?.({
      guide: 'SEARCH',
      mode: 'manual',
      ready: true,
      steps: [createStep('다른 안내')],
    });
  });
  assert.ok(competing);

  await act(async () => first?.cancel());
  assert.equal(renderer?.root.findByType('Coachmark' as never).props.description, '다른 안내');
  await act(async () => competing?.cancel());
});

test('automatic start requires a usable profile and records only after the first step is shown', async () => {
  await renderProvider(createElement(ControllerProbe));
  const probe = () => renderer?.root.findByType('ControllerProbe' as never).props;

  await act(async () => probe()?.requestAutoStart());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);
  assert.equal(commitCalls.length, 0);

  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onShown());
  assert.equal(commitCalls.length, 1);
  assert.deepEqual(commitCalls[0]?.options.variables, { input: { guide: 'TIMELINE' } });

  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onClose());
  await act(async () => probe()?.requestAutoStart());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 0);
});

test('a shown automatic guide removes a queued duplicate for the same account', async () => {
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
  let queued: ReturnType<typeof request>;
  await act(async () => {
    active = request('TIMELINE');
    queued = request('TIMELINE');
  });
  assert.ok(active);
  assert.ok(queued);
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 1);

  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onShown());
  await act(async () => renderer?.root.findByType('Coachmark' as never).props.onClose());
  assert.equal(renderer?.root.findAllByType('Coachmark' as never).length, 0);
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
