export interface UnimplementedActorKeyDispatcher {
  readonly issue: string;
  dispatch(): never;
}

export function createUnimplementedActorKeyDispatcher(
  issue: string,
): UnimplementedActorKeyDispatcher {
  return {
    issue,
    dispatch() {
      throw new Error(`${issue} has not implemented ActivityPub actor key dispatching yet.`);
    },
  };
}
