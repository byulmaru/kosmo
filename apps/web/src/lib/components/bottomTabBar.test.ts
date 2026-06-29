import { describe, expect, test } from 'vitest';
import { getBottomTabItems, isBottomTabActive } from './bottomTabBar';

describe('getBottomTabItems', () => {
  test('replaces the menu tab with a selected profile tab', () => {
    const tabs = getBottomTabItems({ selectedProfileHandle: 'kosmo' });

    expect(tabs.map((tab) => tab.label)).toEqual(['홈', '검색', '글쓰기', '알림', '프로필']);
    expect(tabs.at(-1)).toMatchObject({
      disabled: false,
      href: '/@kosmo',
      icon: 'profile',
      label: '프로필',
    });
  });

  test('disables the profile tab when no profile is selected', () => {
    const tabs = getBottomTabItems({ selectedProfileHandle: null });

    expect(tabs.at(-1)).toMatchObject({
      disabled: true,
      href: undefined,
      icon: 'profile',
      label: '프로필',
    });
  });
});

describe('isBottomTabActive', () => {
  test('marks the selected profile route as active instead of the old menu route', () => {
    const profileTab = getBottomTabItems({ selectedProfileHandle: 'kosmo' }).at(-1);

    expect(profileTab).toBeDefined();
    expect(isBottomTabActive(profileTab!, '/@kosmo')).toBe(true);
    expect(isBottomTabActive(profileTab!, '/menu')).toBe(false);
  });
});
