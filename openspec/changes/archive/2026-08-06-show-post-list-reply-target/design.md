## Context

Home·Profile과 Bookmark의 Post 목록은 공용 `PostListItem` fragment와 renderer를 사용한다. 현재 renderer는 Reply Parent의 ID만 조회하며, 순수 Repost attribution은 icon column과 text slot을 인라인 markup으로 소유한다. 상세 thread의 조상과 하위 Reply도 같은 `PostListItem`을 사용하므로 공용 renderer에 Reply attribution을 무조건 추가하면 상세 thread 제외 계약을 위반한다.

이번 변경은 PROD-696이 승인한 일반 목록 presentation만 확장한다. 기존 Reply Parent 조회·visibility, Post List 후보 정책, Repost·Quote 관계 조합과 상세 thread connector는 그대로 유지한다.

## Goals / Non-Goals

**Goals:**

- 기존 Repost attribution과 동일한 상단 행 구조로 일반 목록의 Reply 대상을 표시한다.
- 일반 Reply와 Reply+Quote는 한 번 표시하고 Parent가 없거나 조회되지 않으면 표시하지 않는다.
- 상세 thread의 조상·현재·하위 모든 행에서 목록용 attribution을 숨긴다.
- Web·Native 공용 renderer와 Relay fragment 경계를 유지한다.
- 기존 Repost presentation과 interaction의 회귀를 최소 범위 테스트로 방지한다.

**Non-Goals:**

- Reply Parent preview, navigation, thread connector 또는 목록 후보 정책 변경
- GraphQL schema·resolver, database, migration 또는 federation 변경
- Reply Composer, Action Bar 동작 또는 Repost·Quote 관계 정책 변경
- 미래 attribution 종류를 위한 registry, variant framework 또는 공용 package 추가

## Implementation Guidance

### Current Constraints

- `PostListItem`의 nullable `replyParent` fragment에는 Parent 작성자 display name이 없어 현재 문구를 만들 수 없다.
- 순수 Repost attribution의 행 layout과 Profile link semantics가 같은 markup에 섞여 있다. Reply는 같은 행 geometry를 쓰지만 링크가 아니므로 interaction까지 공용화하면 의미가 잘못될 수 있다.
- 일반 Post와 Quote는 서로 다른 render branch를 사용한다. attribution을 바깥 카드 경계에 배치하지 않으면 Reply+Quote에서 빠지거나 중복될 수 있다.
- 상세 thread의 조상·하위는 `PostListItem`을 재사용하므로 caller가 일반 목록 전용 metadata 표시 여부를 전달해야 한다.

### Recommended Approach

- `PostListItem` fragment의 nullable Reply Parent에서 작성자 `displayName`을 조회한다. Parent가 `null`이면 기존 Reply 자체만 유지한다.
- 현재 Repost attribution의 icon column·text slot·typography·간격만 소유하는 private layout component를 같은 module에 둔다. icon과 content를 caller가 전달하고, 공용 component는 link 여부나 관계 종류를 추론하지 않는다.
- Repost caller는 현재 repeat icon과 Profile link를 그대로 전달한다. Reply caller는 기존 Reply action과 같은 Message Circle icon과 일반 `Text`를 전달하며 icon은 보조 기술에서 숨긴다.
- 일반 Reply와 Reply+Quote의 카드 본문 위에 같은 Reply attribution node를 한 번 배치한다. Content 없는 순수 Repost는 기존 관계 불변식과 guard를 유지한다.
- `PostListItem`은 기본적으로 일반 목록 attribution을 허용하고, 상세 thread caller가 조상·하위 item에서 이를 명시적으로 끈다. 현재 상세 Post의 `PostLayout`에는 기능을 추가하지 않는다.
- Relay compiler가 생성한 artifact는 검증에만 사용하고 저장소에 commit하지 않는다.

### Allowed Alternatives

없음. 승인된 범위는 Repost와 Reply 두 호출부만 다루며 variant framework나 별도 공용 package를 정당화하지 않는다.

### Known Traps

- `PostListItem`에 attribution을 무조건 렌더링해 상세 thread 조상·하위에 노출하지 않는다.
- Reply 문구를 Repost Profile link, Post body link 또는 Source preview link 안에 중첩하지 않는다.
- 조회되지 않는 Parent를 ID나 대체 문자열로 합성하지 않는다.
- Reply+Quote에서 바깥 Post와 Source 양쪽에 attribution을 중복 표시하지 않는다.
- Repost attribution의 Profile navigation과 접근성 이름을 Reply의 비대화형 의미로 바꾸지 않는다.

## Risks / Trade-offs

- [Quote branch의 card wrapper를 조정하면서 기존 avatar·Source preview geometry가 달라질 수 있음] → 동일 padding·flex row를 보존하고 기존 Quote/Repost Storybook assertion을 함께 실행한다.
- [장식 icon과 문구가 보조 기술에 중복 전달될 수 있음] → icon을 접근성 트리에서 숨기고 plain text 문구만 노출한다.
- [Parent fragment 확장이 현재 schema와 맞지 않을 수 있음] → Relay compiler를 먼저 실행하고 schema·resolver 수정 없이 실패하면 구현을 중단해 범위를 재검토한다.
- [공용 layout 추출이 Repost link target을 바꿀 수 있음] → layout component는 interaction을 소유하지 않고 기존 Link·Pressable subtree를 그대로 child로 받는다.

## Migration Plan

1. canonical design과 OpenSpec delta를 먼저 검증한다.
2. 공용 앱 fragment와 목록 renderer를 additive하게 확장한다.
3. 일반 Reply, Parent 미조회, Reply+Quote, 상세 thread와 기존 Repost를 최소 Storybook/컴포넌트 범위에서 검증한다.
4. Relay compiler, App typecheck·관련 테스트, strict OpenSpec validation과 Web 수동 확인을 수행한다.
5. 문제가 있으면 client presentation diff만 되돌린다. schema·data migration과 backfill은 없다.

## Open Questions

없음.
