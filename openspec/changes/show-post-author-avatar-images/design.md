## Context

PROD-492는 `Profile.avatar { id url }`, `Profile.header { id url }` 공개 projection과 URL이 있으면 이미지를 표시하는 공용 `Avatar.imageUri`를 제공한다. 현재 게시글 presentation 일부는 이 입력을 연결했지만 `ProfileSwitcher`, 공용 `ProfileListItem`, `BottomTabBar`, `PostComposer`, `NotificationListItem`은 여전히 Profile 이미지 필드를 조회하거나 전달하지 않는다. `ProfileSwitcher`의 cover도 header URL 대신 gradient만 표시한다.

이 change는 Profile projection이나 primitive를 다시 만들지 않고, 각 production leaf consumer가 자신이 표시하는 Profile의 공개 URL을 직접 소유하도록 연결한다. 알림 capability의 기존 initials-only 문구는 확장된 PROD-588과 충돌하므로 같은 change에서 명시적으로 갱신한다.

## Goals / Non-Goals

**Goals:**

- 게시글의 직접 작성자와 direct Source, Profile 전환 표면, 공용 Profile 목록 행, 하단 탭, 작성기와 알림 행이 각자 나타내는 Profile의 Ready avatar 이미지를 표시하게 한다.
- `ProfileSwitcher`의 활성 Profile cover가 Ready header 이미지를 표시하고 URL이 없으면 기존 gradient를 유지하게 한다.
- URL이 없을 때 현재 이니셜 fallback을 유지하고 기존 크기·레이아웃·이동·접근성 계약을 보존한다.
- Profile 전환 후 actor별 Relay Environment와 Store 재생성 계약을 바꾸지 않는다.
- 기존 production fragment 기반 Storybook과 Relay/typecheck 표면에서 이미지·fallback 동작을 검증한다.

**Non-Goals:**

- Profile avatar/header 업로드·저장·공개 권한, crop·thumbnail 또는 Media lifecycle 변경
- 공용 Avatar primitive, 기본 avatar asset, 이미지 로드 실패 fallback 정책 변경
- Post 첨부 이미지, 기존 크기·레이아웃·내비게이션 재설계
- 새 dependency, GraphQL schema, API resolver와 DB migration 추가
- iOS·Android 실제 기기 QA

## Implementation Guidance

### Current Constraints

- GraphQL 문서는 실제 소비 컴포넌트에 colocate하고 부모는 leaf fragment를 spread해야 한다. generated Relay artifact는 compiler 산출물이며 저장소에 commit하지 않는다.
- 게시글의 outer 작성자와 direct Source 작성자, Profile 목록의 각 행, Notification의 Related Profile은 서로 다른 Profile일 수 있다. 한 위치의 URL을 다른 위치에 재사용하면 잘못된 이미지를 표시한다.
- `ProfileSwitcher`는 `currentSession.selectedProfile`, 접근 가능한 `me.profiles`, Profile 생성·전환 mutation과 actor environment 재생성을 함께 소유한다. 이미지 연결은 이 상태 전환 경계를 바꾸지 않는다.
- `ProfileListItem`은 검색·팔로워·팔로잉·Reaction Profile 목록이 공유하므로 해당 leaf fragment 한 곳이 avatar를 소유해야 한다.
- Follow Notification subtype fragment는 Related Profile을 직접 표시하며 기존 active `notification` spec은 28px initials-only를 요구한다. delta spec에서 공용 Avatar의 이미지 우선·이니셜 fallback으로 대체해야 한다.
- 기존 Avatar는 URL 존재 여부로 이미지와 이니셜을 선택한다. 네트워크 이미지 로드 실패 뒤 별도 fallback으로 전환하는 계약은 없다.
- header는 Avatar primitive의 역할이 아니므로 기존 cover 영역에서 React Native `Image`로 표시하고 null일 때 gradient를 유지한다.

### Recommended Approach

- 각 production leaf fragment의 표시 Profile selection에 `avatar { id url }`을 추가하고 기존 Avatar 호출에 nullable URL을 `imageUri`로 전달한다.
- 활성 Profile cover를 소유하는 `ProfileSwitcher` fragment에만 `header { id url }`을 추가하고, URL이 있으면 cover 안에 이미지를 채우며 없으면 기존 gradient를 렌더링한다.
- `PostListItem`, `PostLayout`, `PostSourcePresentationView`는 outer 작성자와 direct Source의 avatar를 독립적으로 mapping한다.
- `ProfileListItem` 한 곳에 avatar 연결을 추가해 검색·팔로워·팔로잉·Reaction 목록이 동일한 계약을 재사용하게 한다.
- `BottomTabBar`, `PostComposer`, 각 `NotificationListItem` subtype fragment는 자신이 직접 표시하는 Profile의 avatar만 조회한다.
- label, size, wrapper의 Profile 이동·접근성 속성, ProfileSwitcher mutation과 actor environment 재생성은 그대로 유지한다.
- 기존 Posts·Shell·Profiles·Reactions·Notifications Storybook fixture에 서로 구분되는 이미지 URL과 null 상태를 추가해 production fragment 경로에서 이미지와 fallback을 검증한다.

### Allowed Alternatives

- 내부 presentation 타입은 nullable `avatar` 객체를 유지하거나 nullable `avatarUrl`로 평탄화할 수 있다. 어느 쪽이든 leaf fragment는 `id`와 `url`을 조회하고 Profile별 값을 섞지 않으며 공개 props를 불필요하게 확장하지 않아야 한다.
- header null 분기는 조건부 `Image` 또는 기존 gradient 위의 조건부 image layer로 구현할 수 있다. 실제 이미지가 있을 때 기존 cover geometry를 채우고 null 상태의 gradient가 변하지 않으면 된다.
- 변경 동작을 직접 증명할 수 있는 기존 근접 unit test가 발견되면 Storybook assertion 일부를 그 테스트에 둘 수 있다. 새 fixture·helper·test harness는 추가하지 않는다.

### Known Traps

- route 또는 상위 query에 avatar/header scalar props를 수동으로 추가해 Relay fragment colocation을 우회하지 않는다.
- Quote outer 작성자, Repost 작성자, direct Source 작성자, 목록의 다른 Profile 또는 Notification Related Profile의 URL을 하나로 합치지 않는다.
- data-aware Avatar나 Profile fragment를 소유하는 새 primitive를 만들어 기존 leaf fragment 소유권을 역전하지 않는다.
- 이미지 표시를 이유로 기존 크기, Profile Link, 접근성 label, layout spacing 또는 ProfileSwitcher 전환 동작을 바꾸지 않는다.
- URL 부재 fallback을 네트워크 오류 fallback이나 PROD-596의 기본 asset 범위로 확대하지 않는다.
- `web-app-shell`과 `notification`을 수정하는 다른 active change가 있으므로 archive 시 최신 active spec과 다른 delta를 다시 대조하지 않으면 오래된 계약을 복원할 수 있다.

## Risks / Trade-offs

- [Profile마다 여러 이미지가 함께 표시될 때 URL이 섞임] → leaf fragment별 소유와 서로 다른 fixture URL로 각 위치를 검증한다.
- [ProfileSwitcher 이미지 연결이 actor 전환을 회귀시킴] → 기존 create/switch interaction과 selected Profile store 갱신 검증을 유지한 채 이미지 assertion만 추가한다.
- [공개 또는 비로그인 Profile 조회에서 projection이 예상과 다름] → 제품 코드 완료 주장 전 API/Web runtime에서 Ready 이미지와 null 상태를 각각 관찰하고, 문제가 PROD-492 계약에 있으면 PROD-588에 우회 구현하지 않는다.
- [동시에 active인 capability delta와 archive 충돌] → archive 직전에 `web-app-shell`·`notification` active changes와 base spec을 재대조하고 strict validation을 수행한다.

## Migration Plan

DB 또는 데이터 migration은 없다. PROD-492가 먼저 포함되는 stacked PR base를 유지한다. 배포는 앱 fragment와 presentation 변경만 포함하며 문제가 생기면 PROD-588 commit을 되돌려 기존 이니셜·gradient 표시로 복구할 수 있다. archive는 이 change의 전체 소비자 구현·검증이 끝난 뒤 최신 active capability 계약과 동기화해 수행한다.

## Open Questions

없음. 비로그인 공개 조회, 실제 이미지 로드 결과와 iOS·Android 실제 기기 QA는 구현 선택이 아니라 완료 전 보고에서 Web·자동화와 구분할 항목이다.
