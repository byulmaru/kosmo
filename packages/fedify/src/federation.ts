import { createFederation, MemoryKvStore } from '@fedify/fedify';
import type { Federation } from '@fedify/fedify';

export interface KosmoFederationContextData {
  readonly requestId?: string;
}

export const federation: Federation<KosmoFederationContextData> =
  createFederation<KosmoFederationContextData>({
    kv: new MemoryKvStore(),
  });
