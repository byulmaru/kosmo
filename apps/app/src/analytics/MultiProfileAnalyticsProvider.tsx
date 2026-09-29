import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useSession } from '@/session/SessionProvider';
import { trackAnalytics } from './client';
import { createAnalyticsCaptureOptions } from './multiProfileContext';
import type { PropsWithChildren } from 'react';
import type { AnalyticsEventName, AnalyticsEventProperties } from './events';

type AnalyticsProfileSnapshot = { id: string };

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
  profiles: ReadonlyArray<AnalyticsProfileSnapshot> | null;
  selectedProfileId: string | null;
  status: 'error' | 'guest' | 'valid';
}>;

type CurrentSnapshot = {
  accountId: string | null;
  enabled: boolean;
  profiles: ReadonlyArray<AnalyticsProfileSnapshot> | null;
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
  const lastAvailableCountRef = useRef<{ accountId: string; count: number } | null>(null);
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

    if (current.profiles) {
      trackAnalytics(
        'multi_profile_context_observed',
        { observation_kind: 'availability', available_profile_count: current.profiles.length },
        createAnalyticsCaptureOptions(action.accountId, action.occurredAt ?? new Date()),
      );
    }
  }, []);

  useEffect(() => {
    const current = snapshotRef.current;
    if (!current.enabled || current.status !== 'valid' || !current.accountId) {
      return;
    }

    const count = current.profiles?.length;
    trackAnalytics(
      'multi_profile_context_observed',
      {
        observation_kind: 'screen',
        ...(count === undefined ? {} : { available_profile_count: count }),
        ...(current.selectedProfileId ? { selected_profile_id: current.selectedProfileId } : {}),
      },
      createAnalyticsCaptureOptions(current.accountId),
    );
    if (count !== undefined) {
      lastAvailableCountRef.current = { accountId: current.accountId, count };
    }
  }, [accountId, enabled, pathname, status]);

  const availableProfileCount = profiles?.length;
  useEffect(() => {
    const current = snapshotRef.current;
    if (
      !current.enabled ||
      current.status !== 'valid' ||
      !current.accountId ||
      availableProfileCount === undefined
    ) {
      return;
    }
    if (
      lastAvailableCountRef.current?.accountId === current.accountId &&
      lastAvailableCountRef.current.count === availableProfileCount
    ) {
      return;
    }
    trackAnalytics(
      'multi_profile_context_observed',
      { observation_kind: 'availability', available_profile_count: availableProfileCount },
      createAnalyticsCaptureOptions(current.accountId),
    );
    lastAvailableCountRef.current = { accountId: current.accountId, count: availableProfileCount };
  }, [accountId, availableProfileCount, enabled, status]);

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
  | 'post_created'
  | 'follow_succeeded';

type ProfileActionProperties<Name extends ProfileActionName> = Omit<
  AnalyticsEventProperties[Name],
  'selected_profile_id'
> & { selected_profile_id?: string };

export function useBeginMultiProfileAnalyticsAction() {
  const { accountId, observeAction, selectedProfileId } = useMultiProfileAnalytics();
  const session = useSession();

  return useCallback(() => {
    const operationAccountId = session.status === 'valid' ? session.accountId : null;
    const operationProfileId =
      accountId === operationAccountId ? selectedProfileId : session.selectedProfileId;
    const captureOptions = operationAccountId
      ? createAnalyticsCaptureOptions(operationAccountId)
      : null;
    const track = <Name extends AnalyticsEventName>(
      name: Name,
      properties: AnalyticsEventProperties[Name],
      occurredAt = new Date(),
    ) => {
      const eventProperties =
        operationProfileId &&
        (name === 'search_submitted' ||
          name === 'search_results_loaded' ||
          name === 'search_result_selected')
          ? { selected_profile_id: operationProfileId, ...properties }
          : properties;
      if (operationAccountId) {
        observeAction({ accountId: operationAccountId, occurredAt });
      }
      if (captureOptions) {
        trackAnalytics(name, eventProperties, { ...captureOptions, timestamp: occurredAt });
      } else {
        trackAnalytics(name, eventProperties);
      }
    };
    const trackProfile = <Name extends ProfileActionName>(
      name: Name,
      properties: ProfileActionProperties<Name>,
      occurredAt = new Date(),
    ) => {
      const profileId = properties.selected_profile_id ?? operationProfileId;
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
  }, [
    accountId,
    observeAction,
    selectedProfileId,
    session.accountId,
    session.selectedProfileId,
    session.status,
  ]);
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
