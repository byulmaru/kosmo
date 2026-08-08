import type { DatabaseHandle } from '../db';

export type PostCommit = (handle?: DatabaseHandle) => Promise<void>;

export const noPostCommit: PostCommit = async () => {};

export const oncePostCommit = (effect: PostCommit): PostCommit => {
  let pending: Promise<void> | undefined;

  return (handle) => (pending ??= effect(handle));
};
