import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Coachmark } from '@/components/ui/Coachmark';
import type { ReactNode, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { CoachmarkGuide } from './CoachmarkGuide';

export type CoachmarkStep = Readonly<{
  anchorRef?: RefObject<NativeView | null>;
  description: string;
  title?: string;
}>;

export type CoachmarkRequest = Readonly<{
  accountId?: string;
  guide: CoachmarkGuide;
  mode: 'automatic' | 'manual';
  onShown?: () => void;
  preferredFocusRef?: RefObject<NativeView | HTMLElement | null>;
  ready: boolean;
  steps: readonly CoachmarkStep[];
}>;

export type CoachmarkRequestHandle = Readonly<{ cancel: () => void }>;

type CoachmarkContextValue = Readonly<{
  request: (request: CoachmarkRequest) => CoachmarkRequestHandle | null;
}>;

type ActiveCoachmark = CoachmarkRequest & {
  token: number;
  step: number;
  visible: boolean;
};

type AccountKey = string | null;

type CoachmarkState = Readonly<{
  active: ActiveCoachmark | null;
  accountKey: AccountKey;
}>;

type AccountGeneration = {
  accountKey: AccountKey;
  token: number | null;
  transientSeen: Set<string>;
};

const CoachmarkContext = createContext<CoachmarkContextValue | null>(null);
let nextCoachmarkToken = 0;

const createState = (accountKey: AccountKey): CoachmarkState => ({
  accountKey,
  active: null,
});

export function CoachmarkProvider({
  accountId,
  children,
}: {
  accountId?: string | null;
  children: ReactNode;
}) {
  const accountKey = accountId ?? null;
  const [storedState, setStoredState] = useState(() => createState(accountKey));
  if (storedState.accountKey !== accountKey) {
    setStoredState(createState(accountKey));
  }
  const state = storedState.accountKey === accountKey ? storedState : createState(accountKey);
  // Keep synchronous reservation and account isolation on the existing generation boundary.
  const accountGenerationRef = useRef<AccountGeneration>({
    accountKey,
    token: null,
    transientSeen: new Set(),
  });
  if (accountGenerationRef.current.accountKey !== accountKey) {
    accountGenerationRef.current = {
      accountKey,
      token: null,
      transientSeen: new Set(),
    };
  }
  const accountGeneration = accountGenerationRef.current;

  const transientKey = (request: CoachmarkRequest) =>
    request.accountId ? `${request.accountId}:${request.guide}` : null;
  const canStart = (request: CoachmarkRequest, transientSeen: ReadonlySet<string>) => {
    const key = transientKey(request);
    return request.mode !== 'automatic' || !key || !transientSeen.has(key);
  };
  const request = useCallback(
    (next: CoachmarkRequest) => {
      if (accountGenerationRef.current !== accountGeneration) {
        return null;
      }
      if (
        !next.ready ||
        next.steps.length === 0 ||
        !canStart(next, accountGeneration.transientSeen) ||
        accountGeneration.token !== null
      ) {
        return null;
      }

      const token = ++nextCoachmarkToken;
      const entry = { ...next, step: 0, token, visible: true };
      // Keep same-render requests synchronous so a batch cannot reserve a later presentation.
      accountGeneration.token = token;
      setStoredState((current) => {
        if (current.accountKey !== accountGeneration.accountKey || current.active) {
          return current;
        }
        return { ...current, active: entry };
      });
      return {
        cancel: () => {
          if (
            accountGenerationRef.current !== accountGeneration ||
            accountGeneration.token !== token
          ) {
            return;
          }
          accountGeneration.token = null;
          setStoredState((current) => {
            if (
              current.accountKey !== accountGeneration.accountKey ||
              current.active?.token !== token
            ) {
              return current;
            }
            return { ...current, active: null };
          });
        },
      };
    },
    [accountGeneration],
  );

  const markShown = useCallback(
    (active: ActiveCoachmark) => {
      if (accountGenerationRef.current !== accountGeneration) {
        return;
      }
      const key = transientKey(active);
      if (key && accountGeneration.transientSeen.has(key)) {
        return;
      }
      if (key) {
        accountGeneration.transientSeen.add(key);
      }
      active.onShown?.();
    },
    [accountGeneration],
  );

  const active = state.active;
  const current = active?.steps[active.step];
  const finish = () =>
    setStoredState((value) =>
      active && value.accountKey === accountKey && value.active?.token === active.token
        ? { ...value, active: { ...value.active, visible: false } }
        : value,
    );
  const release = () => {
    if (
      !active ||
      accountGenerationRef.current !== accountGeneration ||
      accountGeneration.token !== active.token ||
      active.visible
    ) {
      return;
    }
    accountGeneration.token = null;
    setStoredState((value) =>
      value.accountKey === accountGeneration.accountKey && value.active?.token === active.token
        ? { ...value, active: null }
        : value,
    );
  };
  const move = (step: number) =>
    setStoredState((value) =>
      active &&
      value.accountKey === accountGeneration.accountKey &&
      value.active?.token === active.token
        ? { ...value, active: { ...value.active, step } }
        : value,
    );
  const presentation =
    active && current ? (
      <Coachmark
        key={active.token}
        anchorRef={current.anchorRef}
        description={current.description}
        onClose={finish}
        onComplete={finish}
        onExited={release}
        onNext={active.step === active.steps.length - 1 ? undefined : () => move(active.step + 1)}
        onPrevious={active.step === 0 ? undefined : () => move(active.step - 1)}
        onShown={active.step === 0 ? () => markShown(active) : undefined}
        preferredFocusRef={active.preferredFocusRef}
        progress={{ current: active.step + 1, total: active.steps.length }}
        title={current.title}
        visible={active.visible}
      />
    ) : null;

  const contextValue = { request };

  return (
    <CoachmarkContext.Provider value={contextValue}>
      {children}
      {presentation}
    </CoachmarkContext.Provider>
  );
}

export function useCoachmark(): CoachmarkContextValue {
  const value = useContext(CoachmarkContext);
  if (!value) {
    throw new Error('useCoachmark must be used inside CoachmarkProvider.');
  }
  return value;
}
