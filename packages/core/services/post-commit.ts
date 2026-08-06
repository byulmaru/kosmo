export type PostCommit = () => Promise<void>;

export const noPostCommit: PostCommit = async () => {};

export const oncePostCommit = (effect: PostCommit): PostCommit => {
  let pending: Promise<void> | undefined;

  return () => (pending ??= effect());
};
