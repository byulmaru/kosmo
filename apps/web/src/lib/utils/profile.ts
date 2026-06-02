// 프로필 표시 공용 유틸 (사이드바·프로필 헤더 등에서 재사용).

// 아바타 이니셜 폴백: 표시 이름 → 핸들 → '?' 순으로 첫 글자.
export const getProfileInitial = (name?: string, handle?: string) =>
  (name || handle || '?').slice(0, 1).toUpperCase();

// 팔로워/팔로잉 등 카운트를 컴팩트 표기(예: 1234 → "1.2k")로 통일.
const compactCountFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
export const formatCount = (count: number) => compactCountFormatter.format(count).toLowerCase();
