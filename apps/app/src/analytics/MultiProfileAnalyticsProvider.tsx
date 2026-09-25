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
  selectedProfileId: string | null;
  status: 'error' | 'guest' | 'valid';
};

const noOpContextValue: MultiProfileAnalyticsContextValue = {
  accountId: null,
  observeAction: () => undefined,
  selectedProfileId: null,
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
    profiles,
    selectedProfileId,
    status,
  });
  snapshotRef.current = {
    accountId,
    enabled,
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
    () => ({ accountId, observeAction, selectedProfileId, status }),
    [accountId, observeAction, selectedProfileId, status],
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

type ProfileActionName =
  | 'profile_created'
  | 'profile_selected'
  | 'profile_switched'
  | 'post_created'
  | 'follow_succeeded';

type ProfileActionProperties<Name extends ProfileActionName> = Omit<
  AnalyticsEventProperties[Name],
  'selected_profile_id'
> & { selected_profile_id?: string };

export function useBeginMultiProfileAnalyticsAction() {
  const { accountId, observeAction, selectedProfileId, status } = useMultiProfileAnalytics();

  return useCallback(() => {
    const operationAccountId = status === 'valid' ? accountId : null;
    const captureOptions = operationAccountId
      ? createAnalyticsCaptureOptions(operationAccountId)
      : null;
    const track = <Name extends AnalyticsEventName>(
      name: Name,
      properties: AnalyticsEventProperties[Name],
      occurredAt = new Date(),
    ) => {
      if (operationAccountId) {
        observeAction({ accountId: operationAccountId, occurredAt });
      }
      trackAnalytics(
        name,
        properties,
        captureOptions ? { ...captureOptions, timestamp: occurredAt } : undefined,
      );
    };
    const trackProfile = <Name extends ProfileActionName>(
      name: Name,
      properties: ProfileActionProperties<Name>,
      occurredAt = new Date(),
    ) => {
      const profileId = properties.selected_profile_id ?? selectedProfileId;
      if (!profileId) {
        return;
      }
      track(
        name,
        { ...properties, selected_profile_id: profileId } as AnalyticsEventProperties[Name],
        occurredAt,
      );
    };
    return { track, trackProfile };
  }, [accountId, observeAction, selectedProfileId, status]);
}

export function useTrackMultiProfileAnalytics() {
  const beginAction = useBeginMultiProfileAnalyticsAction();
  return useCallback(
    <Name extends AnalyticsEventName>(name: Name, properties: AnalyticsEventProperties[Name]) => {
      beginAction().track(name, properties);
    },
    [beginAction],
  );
}
