## 1. 정본과 범위

- [x] 1.1 PROD-785에 DSN-51 독립 followers/following route의 Web·Android·iOS 이관 범위와 제외 범위를 기록한다
- [x] 1.2 Figma Mobile followers `1943:1852`와 following `1943:1998`의 PageHeader·TabList·목록 순서를 readback한다
- [x] 1.3 OpenSpec proposal·design·delta spec을 현재 Expo route와 보존할 Relay lifecycle 기준으로 갱신한다

## 2. 관계 route presentation

- [x] 2.1 Profile layout이 followers/following pathname에서는 ProfileHero 대신 공용 PageHeader·관계 TabList·leaf Slot을 렌더한다
- [x] 2.2 PageHeader는 표시 이름과 관계 종류를 명명하고 같은 Profile 홈으로 돌아가는 44px visual back action을 제공한다
- [x] 2.3 TabList는 현재 관계를 selected로 표시하고 같은 Profile의 followers/following route를 전환한다
- [x] 2.4 ProfileConnectionList의 중복 관계 heading을 제거하고 기존 목록 lifecycle은 유지한다
- [x] 2.5 Mobile Web 셸은 두 route에서 메뉴 전용 header를 중복 렌더링하지 않는다

## 3. 실행 검증

- [x] 3.1 기존 ProfileRoute·shellLayout 실행 테스트로 Profile 홈 Hero 유지, 관계 route Hero 제외, 제목·탭·navigation, Mobile Web header ownership과 Native 단일 scroll을 검증한다
- [x] 3.2 기존 Profile Storybook에서 loading·error·empty·content·pagination retry와 ProfileListItem 표시를 검증한다
- [ ] 3.3 `pnpm --filter @kosmo/app check`, 대상 테스트, 전체 앱 테스트와 `pnpm lint:prettier`를 통과시킨다
- [ ] 3.4 Mobile/Compact/Full Web의 대표 Light/Dark route를 브라우저에서 확인하고 실제 Android/iOS 미검증 여부를 기록한다

## 4. 문서와 전달

- [x] 4.1 PageHeader·breakpoint scroll·Figma implementation 상태 문서를 Production 계약에 맞춘다
- [x] 4.2 Draft PR에 범위, 검증 결과와 남은 Native runtime 공백을 기록한다
