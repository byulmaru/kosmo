import { createFederation, MemoryKvStore } from '@fedify/fedify';
import type { Federation } from '@fedify/fedify';

export const federation: Federation<void> = createFederation<void>({
  kv: new MemoryKvStore(),
});
