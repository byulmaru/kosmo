// 검색 결과 유형 탭. URL `tab` 파라미터의 slug를 source of truth로 둔다.
// 백엔드 결과 분기(향후 post/fediverse 검색)도 같은 정의를 공유할 수 있게 core에 둔다.
// 라벨(인기/최신/미디어/사람)은 표시 전용이라 프론트의 SearchTabs에서만 매핑한다.
export const SearchTab = {
  POPULAR: 'popular',
  LATEST: 'latest',
  MEDIA: 'media',
  PEOPLE: 'people',
} as const;
export type SearchTab = (typeof SearchTab)[keyof typeof SearchTab];

export const SEARCH_TABS = [
  SearchTab.POPULAR,
  SearchTab.LATEST,
  SearchTab.MEDIA,
  SearchTab.PEOPLE,
] as const satisfies readonly SearchTab[];

// 탭이 없거나 알 수 없는 slug면 사람(people)을 기본 활성으로 둔다.
export const DEFAULT_SEARCH_TAB: SearchTab = SearchTab.PEOPLE;

export const parseSearchTab = (value: string | null): SearchTab =>
  SEARCH_TABS.includes(value as SearchTab) ? (value as SearchTab) : DEFAULT_SEARCH_TAB;
