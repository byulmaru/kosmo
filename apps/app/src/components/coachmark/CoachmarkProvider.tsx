import { createContext, useCallback, useContext, useState } from 'react';
import { Coachmark } from '@/components/ui/Coachmark';
import type { CoachmarkGuide } from '@kosmo/core/enums';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import type { View as NativeView } from 'react-native';

export type CoachmarkStep = Readonly<{
  anchorRef: RefObject<NativeView | null>;
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
};

type AccountKey = string | null;

type CoachmarkState = Readonly<{
  active: ActiveCoachmark | null;
  queued: ActiveCoachmark | null;
  accountKey: AccountKey;
  transientSeen: ReadonlySet<string>;
}>;

const CoachmarkContext = createContext<CoachmarkContextValue | null>(null);
let nextCoachmarkToken = 0;

const createState = (accountKey: AccountKey): CoachmarkState => ({
  accountKey,
  active: null,
  queued: null,
  transientSeen: new Set(),
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
  const scopedState = (current: CoachmarkState) =>
    current.accountKey === accountKey ? current : null;
  const setCurrentState = useCallback(
    (action: SetStateAction<CoachmarkState>) =>
      setStoredState((current) => {
        const scoped = scopedState(current);
        if (!scoped) {
          return current;
        }
        return typeof action === 'function' ? action(scoped) : action;
      }),
    [accountKey],
  );

  const transientKey = (request: CoachmarkRequest) =>
    request.accountId ? `${request.accountId}:${request.guide}` : null;
  const canStart = (request: CoachmarkRequest, transientSeen: ReadonlySet<string>) => {
    const key = transientKey(request);
    return request.mode !== 'automatic' || !key || !transientSeen.has(key);
  };
  const closeState = (current: CoachmarkState): CoachmarkState => {
    const queued = current.queued;
    if (!queued || canStart(queued, current.transientSeen)) {
      return queued
        ? { ...current, active: queued, queued: null }
        : { ...current, active: null, queued: null };
    }
    return { ...current, active: null, queued: null };
  };

  const request = useCallback(
    (next: CoachmarkRequest) => {
      if (
        !next.ready ||
        next.steps.length === 0 ||
        !canStart(next, state.transientSeen) ||
        (state.active && state.queued)
      ) {
        return null;
      }

      const token = ++nextCoachmarkToken;
      const entry = { ...next, step: 0, token };
      setStoredState((current) => {
        const scoped = scopedState(current);
        if (!scoped) {
          return current;
        }
        return scoped.active
          ? { ...scoped, queued: scoped.queued ?? entry }
          : { ...scoped, active: entry };
      });
      return {
        cancel: () =>
          setStoredState((current) => {
            const scoped = scopedState(current);
            if (!scoped) {
              return current;
            }
            if (scoped.queued?.token === token) {
              return { ...scoped, queued: null };
            }
            if (scoped.active?.token !== token) {
              return scoped;
            }
            return closeState(scoped);
          }),
      };
    },
    [accountKey, state.active, state.queued, state.transientSeen],
  );

  const markShown = useCallback(
    (active: ActiveCoachmark) => {
      const key = transientKey(active);
      if (key && state.transientSeen.has(key)) {
        return;
      }
      if (key) {
        setStoredState((current) => {
          const scoped = scopedState(current);
          if (!scoped) {
            return current;
          }
          const queued = scoped.queued;
          return {
            ...scoped,
            queued:
              queued && queued.mode === 'automatic' && transientKey(queued) === key ? null : queued,
            transientSeen: new Set(scoped.transientSeen).add(key),
          };
        });
      }
      active.onShown?.();
    },
    [accountKey, state.transientSeen],
  );

  const contextValue = { request };

  return (
    <CoachmarkContext.Provider value={contextValue}>
      {children}
      {state.active ? (
        <CoachmarkPresentation
          active={state.active}
          finish={(token) =>
            setStoredState((current) => {
              const scoped = scopedState(current);
              if (!scoped) {
                return current;
              }
              if (scoped.active?.token !== token) {
                return scoped;
              }
              return closeState(scoped);
            })
          }
          markShown={markShown}
          setState={setCurrentState}
        />
      ) : null}
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

function CoachmarkPresentation({
  active,
  finish,
  markShown,
  setState,
}: {
  active: ActiveCoachmark;
  finish: (token: number) => void;
  markShown: (active: ActiveCoachmark) => void;
  setState: Dispatch<SetStateAction<CoachmarkState>>;
}) {
  const current = active.steps[active.step];
  if (!current) {
    return null;
  }

  const isFirst = active.step === 0;
  const isLast = active.step === active.steps.length - 1;
  const update = (change: (current: ActiveCoachmark) => ActiveCoachmark | null) =>
    setState((state) => {
      if (state.active?.token !== active.token) {
        return state;
      }
      const next = change(state.active);
      return next ? { ...state, active: next } : { ...state, active: null, queued: null };
    });

  return (
    <Coachmark
      key={active.token}
      anchorRef={current.anchorRef}
      description={current.description}
      onClose={() => finish(active.token)}
      onComplete={() => finish(active.token)}
      onNext={isLast ? undefined : () => update((value) => ({ ...value, step: value.step + 1 }))}
      onPrevious={
        isFirst ? undefined : () => update((value) => ({ ...value, step: value.step - 1 }))
      }
      onShown={isFirst ? () => markShown(active) : undefined}
      preferredFocusRef={active.preferredFocusRef}
      title={current.title}
      visible
    >
      {`${active.step + 1} / ${active.steps.length}`}
    </Coachmark>
  );
}
