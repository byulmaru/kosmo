type ConnectionPage<TEdge, TPageInfo> = {
  edges: readonly TEdge[];
  pageInfo: TPageInfo;
};

export const appendConnectionPage = <TEdge, TPageInfo>(
  current: ConnectionPage<TEdge, TPageInfo>,
  next: ConnectionPage<TEdge, TPageInfo>,
): ConnectionPage<TEdge, TPageInfo> => ({
  ...next,
  edges: [...current.edges, ...next.edges],
});

export const loadNextConnectionPage = async <TEdge, TPageInfo>(
  current: ConnectionPage<TEdge, TPageInfo> | null,
  after: string,
  load: (after: string) => Promise<ConnectionPage<TEdge, TPageInfo> | null | undefined>,
): Promise<{ connection: ConnectionPage<TEdge, TPageInfo> | null; error: boolean }> => {
  try {
    const next = await load(after);

    if (!next) {
      return { connection: current, error: true };
    }

    return {
      connection: current ? appendConnectionPage(current, next) : next,
      error: false,
    };
  } catch {
    return { connection: current, error: true };
  }
};
