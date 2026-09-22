import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { trackAnalytics } from './client';
import {
  createAnalyticsCaptureOptions,
  isMultiProfileEligible,
  MultiProfileAnalyticsObserver,
} from './multiProfileUsage';
import type { PropsWithChildren } from 'react';
import type { AnalyticsEventName, AnalyticsEventProperties } from './events';
import type { AnalyticsProfileSnapshot } from './multiProfileUsage';

export type MultiProfileAnalyticsAction = {
  accountId: string;
  occurredAt?: Date;
};

type MultiProfileAnalyticsContextValue = {
  accountId: string | null;
  observeAction: (action: MultiProfileAnalyticsAction) => void;
  status: 'error' | 'guest' | 'valid';
};

const noOpContextValue: MultiProfileAnalyticsContextValue = {
  accountId: null,
  observeAction: () => undefined,
  status: 'guest',
};
const MultiProfileAnalyticsContext =
  createContext<MultiProfileAnalyticsContextValue>(noOpContextValue);

type Props = PropsWithChildren<{
  accountId: string | null;
  enabled: boolean;
  pathname: string;
  profiles: ReadonlyArray<AnalyticsProfileSnapshot>;
  selectedProfileId: string | null;
  status: 'error' | 'guest' | 'valid';
}>;

type CurrentSnapshot = {
  accountId: string | null;
  enabled: boolean;
  observedAt: Date;
  profiles: ReadonlyArray<AnalyticsProfileSnapshot>;
  selectedProfileId: string | null;
  status: Props['status'];
};

export function MultiProfileAnalyticsProvider({
  accountId,
  children,
  enabled,
  pathname,
  profiles,
  selectedProfileId,
  status,
}: Props) {
  const observerRef = useRef<MultiProfileAnalyticsObserver | null>(null);
  if (!observerRef.current) {
    observerRef.current = new MultiProfileAnalyticsObserver();
  }

  const snapshotRef = useRef<CurrentSnapshot>({
    accountId,
    enabled,
    observedAt: new Date(),
    profiles,
    selectedProfileId,
    status,
  });
  snapshotRef.current = {
    accountId,
    enabled,
    observedAt: new Date(),
    profiles,
    selectedProfileId,
    status,
  };

  const observeAction = useCallback((action: MultiProfileAnalyticsAction) => {
    const current = snapshotRef.current;
    if (
      !current.enabled ||
      current.status !== 'valid' ||
      !current.accountId ||
      current.accountId !== action.accountId
    ) {
      return;
    }

    observerRef.current?.observeAction({
      accountId: action.accountId,
      observedAt: action.occurredAt ?? new Date(),
      profiles: current.profiles,
      selectedProfileId: current.selectedProfileId,
    });
  }, []);

  useEffect(() => {
    const current = snapshotRef.current;
    if (!current.enabled || current.status !== 'valid' || !current.accountId) {
      return;
    }

    observerRef.current?.observeScreen({
      accountId: current.accountId,
      observedAt: new Date(),
      profiles: current.profiles,
      selectedProfileId: current.selectedProfileId,
    });
  }, [accountId, enabled, pathname, status]);

  const eligible = isMultiProfileEligible(profiles);
  useEffect(() => {
    const current = snapshotRef.current;
    if (!current.enabled || current.status !== 'valid' || !current.accountId) {
      return;
    }

    observerRef.current?.observeEligibility({
      accountId: current.accountId,
      observedAt: new Date(),
      profiles: current.profiles,
      selectedProfileId: current.selectedProfileId,
    });
  }, [accountId, enabled, eligible, status]);

  const value = useMemo<MultiProfileAnalyticsContextValue>(
    () => ({ accountId, observeAction, status }),
    [accountId, observeAction, status],
  );

  return (
    <MultiProfileAnalyticsContext.Provider value={value}>
      {children}
    </MultiProfileAnalyticsContext.Provider>
  );
}

export function useMultiProfileAnalytics(): MultiProfileAnalyticsContextValue {
  return useContext(MultiProfileAnalyticsContext);
}

export function useTrackMultiProfileAnalytics() {
  const { accountId, observeAction, status } = useMultiProfileAnalytics();

  return useCallback(
    <Name extends AnalyticsEventName>(name: Name, properties: AnalyticsEventProperties[Name]) => {
      const occurredAt = new Date();
      if (status === 'valid' && accountId) {
        observeAction({ accountId, occurredAt });
        trackAnalytics(name, properties, createAnalyticsCaptureOptions(accountId, occurredAt));
        return;
      }

      trackAnalytics(name, properties);
    },
    [accountId, observeAction, status],
  );
}
