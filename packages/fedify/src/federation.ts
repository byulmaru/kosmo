import { createFederation } from '@fedify/fedify';
import type { Federation, FederationOptions, KvStore } from '@fedify/fedify';

export interface KosmoFederationContextData {
  readonly requestId?: string;
}

export type CreateKosmoFederationOptions = Omit<
  FederationOptions<KosmoFederationContextData>,
  'kv'
> & {
  readonly kv: KvStore;
};

export function createKosmoFederation(
  options: CreateKosmoFederationOptions,
): Federation<KosmoFederationContextData> {
  return createFederation<KosmoFederationContextData>(options);
}
