import { buildWebLoginHref } from './publicContentReturn';

export function startWebLogin(returnTarget?: string | null): void {
  window.location.assign(buildWebLoginHref(returnTarget));
}
