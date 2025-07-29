import type { Readable } from 'svelte/store';

export type StoreType<T> = T extends Readable<infer U> ? U : T;
