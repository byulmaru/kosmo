# Proposal: add-post-list-item-component

## Why

프로필 게시글 목록(PROD-88)의 목록 영역 골격과 로딩·빈 상태는 PROD-123에서 끝났지만, 정작 목록에 게시글 한 건을 그릴 항목 컴포넌트가 없어 실데이터 연결(PROD-124)이 막혀 있다(PROD-88의 서브이슈 PROD-122). Figma 목록 디자인(`PostCard`)은 본문 클램프·헤더 우측 시간 등 디테일(`PostBody`)과 표현이 달라, 디테일 컴포넌트 재사용 대신 목록 전용 항목 컴포넌트를 먼저 만든다.

## What Changes

- 게시글 목록 항목 컴포넌트 `PostListItem`(`lib/components/PostListItem.svelte`, 신규)을 추가한다.
  - Mearie fragment 컴포넌트 패턴을 따라 필요한 데이터(`content.bodyText`, `createdAt`, `profile`)를 자체 fragment(`PostListItem_post`)로 선언한다. `PostBody`는 디테일 전용 표현(전체 본문 + 하단 절대시각 메타라인)이라 재사용하지 않는다.
  - 작성자 영역은 main에 머지된 `PostAuthorProfile`을 재사용한다.
  - 본문(Plain Text)은 여러 줄 클램프로 표시하고, 잘린 경우에만 "더보기..." 버튼을 노출한다. 더보기는 디테일 이동 없이 제자리(인라인)에서 본문을 펼친다.
  - 작성 시간은 헤더 우측에 표시한다: 24시간 미만은 상대시간("n분 전"/"n시간 전"), 그 이상은 날짜("2026. 04. 27") — Figma `TimeInfo` variant("n시간 전"/"하루 이상 전")와 일치.
- `PostAuthorProfile`을 비파괴적으로 확장한다: 아바타 크기 prop(`avatarSize`, 기본 `md`=40px, 목록은 `lg`=48px — Figma 목록 PostCard 기준)과 이름 블록 우측 슬롯(`trailing`, 시간 표시용)을 추가한다.
- Storybook 스토리(`KOSMO/PostListItem`)를 추가해 긴 본문(클램프·펼침), 긴 표시 이름·핸들, 상대/절대 시간, 빈 본문 등 edge case를 백엔드 없이 리뷰할 수 있게 한다.
- (Non-goals) 목록 컨테이너(`PostList`)에 항목 렌더링·실데이터 연결(PROD-124), 게시글 디테일로의 이동 링크(별도 서브이슈), 액션바·리액션바·이미지·링크 프리뷰(이슈 범위 외)는 본 체인지의 범위 밖이다.

BREAKING 변경 없음.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 게시글 목록 항목 표시(작성자·본문 클램프·작성 시간) 요구사항을 추가한다.

## Impact

- 영향 코드(apps/web): `lib/components/PostListItem.svelte`·`lib/components/PostListItem.stories.svelte`(신규), `lib/components/PostAuthorProfile.svelte`·`lib/components/PostAuthorProfile.stories.svelte`(확장).
- 재사용: `PostAuthorProfile`(작성자 영역), `Avatar`(`lg` 사이즈 기존 지원), `temporal-polyfill`(시간 포맷 — `PostBody`와 같은 의존), 시맨틱 디자인 토큰.
- 소비 API: 기존 `Post` 스키마 필드(`content.bodyText`, `createdAt`, `profile`)만 fragment로 선택. 백엔드 변경 없음.
- 의존: main에 머지된 컴포넌트만 사용한다(PROD-89/PR #75 머지 완료, `PostBody`는 재사용하지 않으므로 무관). 항목을 목록에 연결하는 PROD-124가 이 체인지에 의존한다.
