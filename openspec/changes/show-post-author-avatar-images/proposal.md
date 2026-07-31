## Why

PROD-492가 Profile의 Ready avatar/header 공개 URL과 이미지 표시가 가능한 공용 Avatar를 제공하지만, 현재 앱의 여러 production 소비자는 해당 URL을 Relay fragment에서 조회하거나 presentation에 전달하지 않아 기본 아바타 또는 임시 gradient만 표시한다. 게시글뿐 아니라 현재 Profile을 나타내는 공용 UI 전반에서 실제 Profile 이미지를 일관되게 표시해야 한다.

## What Changes

- 홈·프로필·북마크 목록, 게시글 상세와 Reply Composer에서 일반 Post, Repost, Quote와 direct Source 작성자의 실제 Ready avatar 이미지를 표시한다.
- `ProfileSwitcher`의 full·drawer·compact trigger와 프로필 전환 목록에 각 Profile의 실제 avatar를 표시하고, 활성 Profile의 Ready header URL이 있으면 기존 cover 영역에 실제 이미지를 표시한다.
- 팔로워·팔로잉·Reaction 목록이 공유하는 `ProfileListItem`, `BottomTabBar`, `PostComposer`, `NotificationListItem`에 해당 Profile의 실제 avatar를 표시한다.
- 각 leaf Relay fragment가 자신이 표시하는 Profile의 `avatar { id url }`을 조회하고 기존 `Avatar.imageUri`에 전달하며, 활성 Profile header를 표시하는 fragment만 `header { id url }`을 조회한다.
- avatar 관계 또는 공개 URL이 없으면 PROD-596의 승인된 기본 아바타 fallback을 유지하고, header 관계 또는 공개 URL이 없으면 기존 gradient cover를 유지한다.
- 기존 크기, 레이아웃, Profile 이동, 접근성 이름과 actor별 Relay Environment 전환 계약을 유지한다.
- 알림 목록 계약을 Ready avatar 이미지 우선·승인된 기본 아바타 fallback 계약으로 갱신한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/design/figma.md`
- Linear Contract: [PROD-588](https://linear.app/byulmaru/issue/PROD-588), fallback 계약 [PROD-596](https://linear.app/byulmaru/issue/PROD-596)
- Linear Implementations: PROD-588; Profile avatar/header 공개 표현 제공 의존성 [PROD-492](https://linear.app/byulmaru/issue/PROD-492); 기본 아바타 제공 의존성 PROD-596

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-post`: 게시글 목록·상세와 direct Source 작성자가 Ready avatar 이미지를 우선 표시하고 이미지가 없을 때만 승인된 기본 아바타 fallback을 표시한다.
- `web-app-shell`: `ProfileSwitcher`, 공용 `ProfileListItem`, `BottomTabBar`, `PostComposer`와 게시글 presentation이 각 Profile의 실제 이미지와 기존 fallback을 일관되게 표시한다.
- `notification`: Follow·Reaction·Reply·Repost Notification 행이 Related Profile의 Ready avatar 이미지를 28px 공용 Avatar로 표시하고 이미지가 없을 때 승인된 기본 아바타 fallback을 유지한다.

## Impact

- `apps/app`의 게시글 presentation과 `ReplyComposerSurface`, `ProfileSwitcher`, `ProfileListItem`, `BottomTabBar`, `PostComposer`, `NotificationListItem` Relay fragment와 기존 Posts·Shell·Profiles·Reactions·Notifications Storybook 검증이 영향을 받는다.
- PROD-492가 제공하는 `Profile.avatar { id url }`, `Profile.header { id url }`와 `Avatar.imageUri`를 선행 입력으로 사용한다.
- PROD-588 자체에서 GraphQL schema, API resolver, DB migration, Media 공개 정책, 새 dependency는 변경하지 않는다.
- 공용 Avatar primitive 재설계, 업로드·저장·crop·thumbnail, Post 첨부 이미지, PROD-596가 소유하는 기본 avatar asset 자체 변경, 네트워크 이미지 로드 실패 fallback과 iOS·Android 실제 기기 QA는 제외한다.
