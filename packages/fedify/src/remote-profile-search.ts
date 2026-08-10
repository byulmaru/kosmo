import { federation } from './federation';
import { createFedifyExecutionContext } from './fedify-execution';
import { findOrMaterializeRemoteProfileActor } from './remote-actor-materialization';

type ScheduleRefresh = (refresh: () => Promise<void>) => void;

export const findOrMaterializeRemoteProfileActorForProfileSearch = async ({
  canonicalOrigin,
  handle,
  scheduleRefresh,
}: {
  canonicalOrigin: string;
  handle: string;
  scheduleRefresh?: ScheduleRefresh;
}) =>
  findOrMaterializeRemoteProfileActor({
    context: federation.createContext(new URL(canonicalOrigin), createFedifyExecutionContext()),
    handle,
    scheduleRefresh,
  });
