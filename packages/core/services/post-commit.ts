import type { Database } from '../db';

export type PostCommit = (handle?: Database) => Promise<void>;

export const noPostCommit: PostCommit = async () => {};

export const oncePostCommit = (effect: PostCommit): PostCommit => {
  let pending: Promise<void> | undefined;

  return (handle) => (pending ??= effect(handle));
};
