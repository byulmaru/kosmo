import { browser } from '$app/environment';

// 최근 검색어를 localStorage에 저장한다. 백엔드 없이 입력 중 단계에서 노출한다.
const STORAGE_KEY = 'kosmo:recent-searches';
const MAX_ITEMS = 8;

export function getRecentSearches(): string[] {
  if (!browser) {
    return [];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function save(terms: string[]): void {
  if (!browser) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(terms));
  } catch {
    // localStorage 접근이 막힌 환경(프라이빗 모드 등)에서는 조용히 무시한다.
  }
}

// 최근 검색어를 맨 앞에 추가한다(중복 제거, 최대 MAX_ITEMS). 갱신된 목록을 반환한다.
export function addRecentSearch(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) {
    return getRecentSearches();
  }

  const next = [trimmed, ...getRecentSearches().filter((value) => value !== trimmed)].slice(
    0,
    MAX_ITEMS,
  );
  save(next);
  return next;
}

export function removeRecentSearch(term: string): string[] {
  const next = getRecentSearches().filter((value) => value !== term);
  save(next);
  return next;
}

export function clearRecentSearches(): string[] {
  save([]);
  return [];
}
