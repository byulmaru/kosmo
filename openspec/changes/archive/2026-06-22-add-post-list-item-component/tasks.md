# Tasks: add-post-list-item-component

## 1. PostAuthorProfile 확장

- [x] 1.1 `PostAuthorProfile.svelte`에 `avatarSize?: 'md' | 'lg'` prop(기본 `md`)을 추가하고 아바타 크기·거터 폭(`w-10`/`w-12`)을 연동한다
- [x] 1.2 `PostAuthorProfile.svelte`에 이름 블록 우측 정렬 `trailing?: Snippet` 슬롯을 추가한다
- [x] 1.3 `PostAuthorProfile.stories.svelte`에 avatarSize/trailing 케이스를 추가한다

## 2. PostListItem 구현

- [x] 2.1 `PostListItem.svelte`를 생성하고 `PostListItem_post` fragment(content.bodyText, createdAt, profile + PostAuthorProfile spread)를 선언한다
- [x] 2.2 `PostAuthorProfile`(avatarSize=lg) + trailing 시간 + 본문으로 항목 레이아웃을 구성한다 (빈 본문이면 본문 영역 생략)
- [x] 2.3 작성 시간 표시를 구현한다: 24시간 미만 상대시간(`Intl.RelativeTimeFormat`, "지금"/"n초 전"/"n분 전"/"n시간 전"), 이상 날짜("2026. 04. 27"), `<time datetime>` 포함
- [x] 2.4 본문 잘림(200자 또는 10줄 초과 시 말줄임)을 구현하고, 잘린 경우에만 "더보기..." 버튼을 노출한다
- [x] 2.5 "더보기..." 클릭 시 인라인 펼침(버튼 숨김)을 구현한다

## 3. Storybook

- [x] 3.1 `PostListItem.stories.svelte`를 추가한다: 기본 / 긴 본문(클램프→펼침) / 줄바꿈 많은 본문 / 긴 표시 이름·긴 핸들 / 상대시간(초·분·시간) / 날짜 표시 / 빈 본문

## 4. 검증

- [x] 4.1 lint·typecheck 스크립트를 통과시킨다
- [x] 4.2 Storybook에서 스토리 렌더를 확인한다 (시각 확인은 사용자)

## 5. 리뷰 반영

- [x] 5.1 시간 포맷을 `Intl.RelativeTimeFormat` 기반으로 바꾸고 `@kosmo/core/datetime`으로 추출한다 (`PostBody` 날짜 포맷도 공유)
- [x] 5.2 `PostAuthorProfile`·`Avatar`의 클래스 분기를 `tailwind-variants`로 정리한다 (`$lib/tv`의 twMergeConfig wrapper 포함)
