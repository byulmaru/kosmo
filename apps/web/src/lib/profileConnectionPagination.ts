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
