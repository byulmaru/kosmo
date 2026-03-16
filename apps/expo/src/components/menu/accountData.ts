type AccountAction = {
  id: string;
  label: string;
  icon: 'person-outline' | 'people-outline' | 'settings-outline';
};

export const currentProfile = {
  name: 'Kosmo Studio',
  handle: '@kosmo',
  bio: '현재 피드와 작성은 이 프로필 기준으로 동작합니다.',
};

export const secondaryProfiles = [
  {
    id: 'robin',
    name: 'Robin Creator',
    handle: '@robin',
  },
  {
    id: 'team',
    name: 'Team Ops',
    handle: '@team',
  },
];

export const accountActions: AccountAction[] = [
  {
    id: 'my-profile',
    label: '내 프로필',
    icon: 'person-outline',
  },
  {
    id: 'manage-profiles',
    label: '프로필 관리',
    icon: 'people-outline',
  },
  {
    id: 'settings',
    label: '설정',
    icon: 'settings-outline',
  },
] as const;
