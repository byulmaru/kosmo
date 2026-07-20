export function resolvePaginationLoadErrorAfterRefresh(
  currentLoadError: boolean,
  refreshError: Error | null,
): boolean {
  return refreshError ? currentLoadError : false;
}
