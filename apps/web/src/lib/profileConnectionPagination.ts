type ConnectionPage<TEdge, TPageInfo> = {
  edges: readonly TEdge[];
  pageInfo: TPageInfo;
};

type LoadNextConnectionPageResult<TEdge, TPageInfo> = {
  connection: ConnectionPage<TEdge, TPageInfo> | null;
  error: boolean;
  stale?: boolean;
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
  isCurrent = () => true,
): Promise<LoadNextConnectionPageResult<TEdge, TPageInfo>> => {
  try {
    const next = await load(after);

    if (!isCurrent()) {
      return { connection: current, error: false, stale: true };
    }

    if (!next) {
      return { connection: current, error: true };
    }

    return {
      connection: current ? appendConnectionPage(current, next) : next,
      error: false,
    };
  } catch {
    if (!isCurrent()) {
      return { connection: current, error: false, stale: true };
    }

    return { connection: current, error: true };
  }
};
