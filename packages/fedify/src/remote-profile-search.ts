import { federation } from './federation';
import { createFedifyExecutionContext } from './fedify-execution';
import { findOrMaterializeRemoteProfileActor } from './remote-actor-materialization';

export const findOrMaterializeRemoteProfileActorForProfileSearch = async ({
  canonicalOrigin,
  handle,
  scheduleRefresh,
}: {
  canonicalOrigin: string;
  handle: string;
  scheduleRefresh?: (refresh: () => Promise<void>) => void;
}) =>
  findOrMaterializeRemoteProfileActor({
    context: federation.createContext(new URL(canonicalOrigin), createFedifyExecutionContext()),
    handle,
    scheduleRefresh,
  });
