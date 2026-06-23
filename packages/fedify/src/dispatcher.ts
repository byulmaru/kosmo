export interface UnimplementedActivityPubDispatcher {
  readonly issue: string;
  dispatch(): never;
}

export function createUnimplementedActivityPubDispatcher(
  issue: string,
): UnimplementedActivityPubDispatcher {
  return {
    issue,
    dispatch() {
      throw new Error(`${issue} has not implemented ActivityPub dispatching yet.`);
    },
  };
}
