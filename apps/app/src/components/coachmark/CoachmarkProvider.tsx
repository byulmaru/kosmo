import { createContext, useCallback, useContext, useState } from 'react';
import { Coachmark } from '@/components/ui/Coachmark';
import type { CoachmarkGuide } from '@kosmo/core/enums';
import type { ReactNode, RefObject } from 'react';
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
  visible: boolean;
};

type AccountKey = string | null;

type CoachmarkState = Readonly<{
  active: ActiveCoachmark | null;
  accountKey: AccountKey;
  transientSeen: ReadonlySet<string>;
}>;

const CoachmarkContext = createContext<CoachmarkContextValue | null>(null);
let nextCoachmarkToken = 0;

const createState = (accountKey: AccountKey): CoachmarkState => ({
  accountKey,
  active: null,
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

  const transientKey = (request: CoachmarkRequest) =>
    request.accountId ? `${request.accountId}:${request.guide}` : null;
  const canStart = (request: CoachmarkRequest, transientSeen: ReadonlySet<string>) => {
    const key = transientKey(request);
    return request.mode !== 'automatic' || !key || !transientSeen.has(key);
  };
  // Keep same-render requests synchronous so a batch cannot reserve a later presentation.
  let occupied = Boolean(state.active?.visible);
  const request = useCallback(
    (next: CoachmarkRequest) => {
      if (
        !next.ready ||
        next.steps.length === 0 ||
        !canStart(next, state.transientSeen) ||
        occupied
      ) {
        return null;
      }

      const token = ++nextCoachmarkToken;
      const entry = { ...next, step: 0, token, visible: true };
      occupied = true;
      setStoredState((current) => {
        if (current.accountKey !== accountKey || current.active?.visible) {
          return current;
        }
        return { ...current, active: entry };
      });
      return {
        cancel: () =>
          setStoredState((current) => {
            if (current.accountKey !== accountKey || current.active?.token !== token) {
              return current;
            }
            return { ...current, active: null };
          }),
      };
    },
    [accountKey, state.active, state.transientSeen],
  );

  const markShown = useCallback(
    (active: ActiveCoachmark) => {
      const key = transientKey(active);
      if (key && state.transientSeen.has(key)) {
        return;
      }
      if (key) {
        setStoredState((current) => {
          if (current.accountKey !== accountKey) {
            return current;
          }
          return {
            ...current,
            transientSeen: new Set(current.transientSeen).add(key),
          };
        });
      }
      active.onShown?.();
    },
    [accountKey, state.transientSeen],
  );

  const active = state.active;
  const current = active?.steps[active.step];
  const finish = () =>
    setStoredState((value) =>
      active && value.accountKey === accountKey && value.active?.token === active.token
        ? { ...value, active: { ...value.active, visible: false } }
        : value,
    );
  const move = (step: number) =>
    setStoredState((value) =>
      active && value.accountKey === accountKey && value.active?.token === active.token
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
        onNext={active.step === active.steps.length - 1 ? undefined : () => move(active.step + 1)}
        onPrevious={active.step === 0 ? undefined : () => move(active.step - 1)}
        onShown={active.step === 0 ? () => markShown(active) : undefined}
        preferredFocusRef={active.preferredFocusRef}
        title={current.title}
        visible={active.visible}
      >
        {`${active.step + 1} / ${active.steps.length}`}
      </Coachmark>
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
