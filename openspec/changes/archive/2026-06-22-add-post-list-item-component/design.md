# Design: add-post-list-item-component

## Context

- 목록 컨테이너(`PostList.svelte`)는 PROD-123에서 로딩 스켈레톤·빈 상태까지 구현됐고, 항목 렌더링은 `TODO(PROD-124)`로 남아 있다.
- 재사용 가능한 재료: `PostAuthorProfile`(작성자 영역, `href` variant·`children` snippet 보유, main 머지), `Avatar`(`xs`~`xl` 사이즈), `PostBody`(디테일 전용: 전체 본문 + 하단 절대시각·공개범위 메타라인), `temporal-polyfill`.
- Figma 기준 디자인: POST 섹션 `PostCard`(67:206, Cosmo variant 67:207). 목록 항목은 ① 좌측 48px 아바타 거터, ② 헤더(이름·핸들 좌측 + 시간 우측), ③ 본문 클램프 + "더보기..."(ExpandButton, `more` 색) 구조다. 디테일 `ThreadPost`(696:552)와 표현이 다르다.
- 시간 표기는 Figma `TimeInfo`(67:245)의 두 variant("n시간 전" / "하루 이상 전"=날짜)와 맞춘다.

## Goals / Non-Goals

**Goals:**

- 게시글 한 건을 목록 행으로 표시하는 fragment 컴포넌트 `PostListItem`을 제공한다(본문·작성자·작성 시간).
- 긴 본문을 클램프하고 잘린 경우에만 "더보기..."로 제자리 펼침을 제공한다.
- Storybook에서 단독으로 edge case를 확인할 수 있게 한다.

**Non-Goals:**

- 목록 컨테이너 연결·실데이터 query(PROD-124), 디테일 이동 링크(별도 서브이슈), 액션바·리액션·이미지·링크 프리뷰·Repost/Quote variant.

## Decisions

### D1. `PostBody` 재사용 대신 자체 fragment 선언

- Figma에서 목록(클램프 + 헤더 우측 상대시간)과 디테일(전체 본문 + 하단 절대시각 메타라인)의 표현이 다르다. `PostBody`를 재사용하면 클램프·시간 위치를 덮어쓰는 예외 처리만 늘어난다.
- Mearie fragment 컴포넌트 패턴(컴포넌트가 필요한 데이터는 자신이 fragment로 선언, 같은 필드를 두 fragment가 선언해도 비용 없음)에 따라 `PostListItem_post` fragment를 자체 선언한다.

```graphql
fragment PostListItem_post on Post {
  id
  content {
    id
    bodyText
  }
  createdAt
  profile {
    id
    ...PostAuthorProfile_profile
  }
}
```

### D2. `PostAuthorProfile` 비파괴 확장 (대안: 항목 컴포넌트가 헤더 자체 구현)

- 시간이 이름 블록과 같은 행 우측에 와야 하는데 `PostAuthorProfile`에는 그 슬롯이 없다. 작성자 영역을 항목 컴포넌트가 따로 구현하면 아바타 거터·이름 블록 마크업이 중복되므로, `trailing?: Snippet` 슬롯(이름 블록 우측 정렬)을 추가한다.
- Figma 목록 아바타는 48px, 디테일은 40px이다. `avatarSize?: 'md' | 'lg'`(기본 `md`) prop을 추가하고 거터 폭(`w-10`/`w-12`)을 연동한다. 기본값이 기존과 같아 디테일 페이지 호출부는 변경 없다.

### D3. 텍스트 기준 잘림 + 인라인 펼침 (대안: CSS line-clamp + 렌더 측정 / 디테일 이동)

- 디테일 이동 링크는 별도 서브이슈 범위라, Figma ExpandButton("더보기...")은 제자리 펼침으로 구현한다. 자기완결적이어서 PROD-124 연결 시 동작 변경이 없다.
- 잘림 기준은 렌더 측정 없이 본문 텍스트로 판정한다: **200자(코드 포인트) 초과 또는 줄바꿈 10줄 초과**면 자르고 말줄임표·버튼을 노출한다. 줄 상한은 글자 수는 적어도 줄바꿈이 많은 본문이 목록을 길게 차지하는 구멍을 막는다.
  - 처음에는 Figma PostText 예시 기준 4줄 CSS `line-clamp` + `scrollHeight` 측정으로 구현했으나, 4줄이 너무 짧다는 판단에 글자 수 기준으로 교체했다. 텍스트 판정은 SSR에서도 동일하게 동작해 마운트 후 버튼이 늦게 나타나는 문제가 없고, ResizeObserver 측정 코드도 필요 없다.
  - 임계값(200자·10줄)은 디자인 확정값이 아닌 초기 정책값이며, PR에서 논의해 조정한다.
- 펼친 뒤 다시 접는 버튼은 두지 않는다(Figma에 없음).

### D4. 시간 포맷: 24시간 경계의 상대/절대 전환

- 24시간 미만이면 상대시간, 그 이상이면 ko-KR 날짜("2026. 04. 27", 끝 마침표 제거)를 표시한다.
- 상대시간은 손으로 만든 문자열 대신 `Intl.RelativeTimeFormat('ko', { numeric: 'auto' })` 출력을 그대로 사용한다(0초 "지금", 그 외 "n초 전"/"n분 전"/"n시간 전" — 리뷰 반영으로 Figma TimeInfo의 "방금 전" 표기 대신 표준 API 출력을 따른다).
- 포맷 로직은 `@kosmo/core/datetime`으로 추출해 공통화하고(리뷰 반영), 날짜 포맷(끝 마침표 제거)은 `PostBody`도 같은 helper를 공유한다.
- `<time datetime>`으로 기계 가독 시각을 함께 제공한다. 상대시간의 실시간 갱신(타이머)은 두지 않는다 — 목록 리렌더 시 재계산되면 충분하고, Figma·이슈에 갱신 요구가 없다.

## Risks / Trade-offs

- [잘림 임계값 미확정] 200자·10줄은 정책 확정 전 초기값 → PR 논의로 조정하고, 상수 두 개만 바꾸면 된다. 렌더 줄 수 기준이 아니라 좁은 화면에서는 200자가 더 많은 줄을 차지할 수 있다.
- [상대시간 고정] 화면을 오래 켜두면 "n분 전"이 갱신되지 않는다 → 목록 query 연결(PROD-124) 후 refetch·리렌더 시 자연 갱신. 필요해지면 후속 이슈로 타이머 도입.
- [아바타 48px 확장] `PostAuthorProfile` 거터 폭 변경이 디테일 페이지에 번지지 않도록 기본값을 `md`로 유지하고 스토리로 양쪽을 고정한다.
