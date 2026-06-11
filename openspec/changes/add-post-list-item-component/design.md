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

### D3. 클램프 + 인라인 펼침 (대안: 클램프만 / 디테일 이동)

- 디테일 이동 링크는 별도 서브이슈 범위라, Figma ExpandButton("더보기...")은 제자리 펼침으로 구현한다. 자기완결적이어서 PROD-124 연결 시 동작 변경이 없다.
- 본문은 Figma 예시 기준 4줄 `line-clamp`. 잘림 여부는 본문 요소의 `scrollHeight > clientHeight` 비교로 감지해 잘린 경우에만 버튼을 노출한다(리사이즈 시 재평가).
- 펼친 뒤 다시 접는 버튼은 두지 않는다(Figma에 없음).

### D4. 시간 포맷: 24시간 경계의 상대/절대 전환

- `Temporal.Instant` 비교로 24시간 미만이면 상대시간("방금 전"/"n분 전"/"n시간 전"), 그 이상이면 ko-KR 날짜("2026. 04. 27", 끝 마침표 제거 — `PostBody`와 같은 처리)를 표시한다.
- `<time datetime>`으로 기계 가독 시각을 함께 제공한다. 상대시간의 실시간 갱신(타이머)은 두지 않는다 — 목록 리렌더 시 재계산되면 충분하고, Figma·이슈에 갱신 요구가 없다.

## Risks / Trade-offs

- [클램프 감지 SSR] `scrollHeight` 비교는 브라우저에서만 가능 → SSR 직후엔 버튼 없이 클램프만 적용되고, 마운트 후 잘림이 감지되면 버튼이 나타난다. 레이아웃 이동은 버튼 행 높이만큼으로 제한적이다.
- [상대시간 고정] 화면을 오래 켜두면 "n분 전"이 갱신되지 않는다 → 목록 query 연결(PROD-124) 후 refetch·리렌더 시 자연 갱신. 필요해지면 후속 이슈로 타이머 도입.
- [아바타 48px 확장] `PostAuthorProfile` 거터 폭 변경이 디테일 페이지에 번지지 않도록 기본값을 `md`로 유지하고 스토리로 양쪽을 고정한다.
