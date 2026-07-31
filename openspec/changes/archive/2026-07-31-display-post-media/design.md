## Context

`PostBody`는 목록과 상세가 공유하는 Relay fragment 경계이고 `PostContentRenderer`는 V1 document에서 현재
paragraph/text/hard-break/link만 표시한다. 목록의 `PostListRow`는 `bodyText`가 truthy일 때만 `PostBody`를
mount하므로 media-only Post는 renderer에 도달하지 않는다. PROD-570은 `PostContent.media`를 document의
Media node 순서로 제공하고, 각 Media의 global `id`, nullable `url`, `mediaType`, `altText`를 viewer scope로
보호한다.

공용 앱은 React Native primitive와 Relay fragment colocation을 사용해야 한다. 기존 document scalar는 앱에서
native-safe JSON으로 판별하며 ProseMirror runtime을 bundle에 포함하지 않는다. Web과 Native의 접근성·입력
검증 범위는 서로 대체할 수 없다.

## Goals / Non-Goals

**Goals:**

- `PostBody`가 현재 Post Content의 document, ordered Media와 Sensitive Media 상태를 함께 소비한다.
- 목록·상세가 동일한 Media 표시, 접근성, 가림·공개와 실패·재시도 동작을 사용한다.
- media-only Post도 실제 Post body surface를 mount한다.
- Media 한 건의 실패를 Post 나머지 내용과 action에서 격리한다.

**Non-Goals:**

- Composer 업로드·작성, backend URL 발급·권한과 Media Storage Service를 변경하지 않는다.
- Quote/Reply 전용 preview layout, fullscreen viewer, swipe, zoom, 다운로드를 추가하지 않는다.
- 파생 thumbnail, fullscreen viewer와 Remote Media fetch/proxy를 추가하지 않는다.

## Implementation Guidance

### Current Constraints

- `PostContentRenderer`가 전체 document를 하나의 `Text` tree로 만들기 때문에 `Image`, fallback, control을 그
  내부에 바로 추가할 수 없다.
- document Media node는 global Media ID를 가지고 PROD-570의 `PostContent.media`도 같은 document 순서의
  실제 Node를 제공한다. UI에서 raw URL만 별도 query하거나 Media Storage Service를 호출하면 조회 권한과
  Relay ownership을 우회한다.
- `PostContent.media`는 필요한 표시 정보가 하나라도 불완전하면 partial list 대신 null이 된다. UI는 이
  상태와 개별 `Image` onError를 구분해야 한다.
- `PostListRow`의 현재 `bodyText` 조건은 media-only document를 숨긴다.

### Recommended Approach

- `PostBody` fragment에 `content.media { id url mediaType altText }`를 colocate하고 fragment 결과를
  `PostContentRenderer`에 전달한다. renderer는 기존 text/link projection을 유지하면서 document Media node
  순서와 같은 Media list를 별도 공용 Media surface에 넘긴다.
- text projection과 Media surface를 sibling으로 구성해 React Native `Text` 안에 View/Image를 넣지 않는다.
  Media surface는 최대 네 항목을 document 순서로 표시하고 theme spacing/radius/color를 사용한다.
- Sensitive Media 상태는 각 mounted Post body가 로컬 boolean으로 소유한다. true인 document는 Image를
  mount하지 않은 placeholder에서 시작하고, 하나의 button이 모든 Media를 표시하거나 다시 가린다.
- 각 Media item은 독립적인 load/error 상태와 retry generation을 소유한다. retry는 GraphQL refetch나 새 URL
  발급을 만들지 않고 현재 `url`을 가진 `Image`를 새 key로 remount한다.
- 목록은 `bodyText`가 아니라 `content` 존재를 기준으로 `PostBody`를 mount한다. 목록 row navigation wrapper와
  Media의 공개·재시도 button이 중첩 Pressable이 되지 않도록 body 전체 navigation Pressable을 제거하거나
  text-only navigation과 Media control 경계를 분리한다.

### Allowed Alternatives

- Media item의 상태를 gallery parent의 ID-keyed reducer로 관리해도 된다. 각 Media 실패·재시도 격리,
  document 순서, Sensitive Media 전체 가림과 접근성 결과가 같아야 한다.

### Known Traps

- document의 internal UUID를 URL key 또는 새 network query에 사용하지 않는다. 앱에서 받는 Media identity는
  GraphQL global ID다.
- `PostContent.media === null`을 빈 목록으로 취급하지 않는다. 빈 목록은 media-less이고 null은 필요한 표시
  정보 unavailable이다.
- 각 Image는 `Image.getSize()`의 원본 크기로 frame 비율을 계산한다. surface 폭은 모두 채우고 가로·정사각형은
  원본 종횡비를 유지하며, 세로는 높이가 surface 폭을 넘지 않도록 1:1 frame에서 `cover` crop한다.
- Alt Text null을 `accessible={false}`로 바꿔 Post의 의미 있는 첨부 이미지를 보조 기술에서 숨기지 않는다.
- blur overlay 아래 Image를 미리 mount하면 기본 가림 상태에서도 image byte와 시각 정보가 노출될 수 있으므로
  Sensitive Media 공개 전에는 Image를 mount하지 않는다.
- Storybook Web a11y 통과를 Native VoiceOver/TalkBack runtime 검증 완료로 일반화하지 않는다.

## Risks / Trade-offs

- [현재 URL 자체가 더 이상 유효하지 않으면 같은 URL 재시도도 실패한다] → fallback을 유지하고 URL 재발급이나
  Relay refetch는 backend 계약이 생기기 전까지 추가하지 않는다.
- [목록의 기존 전체 body Pressable 안에 Media control을 넣으면 interaction이 중첩된다] → Post navigation과
  Media action의 Pressable 경계를 분리하고 기존 시간 링크·상세 route를 유지한다.
- [원본 크기를 알기 전과 조회 뒤 frame 높이가 달라질 수 있다] → 초기 frame은 최대 높이인 1:1로 두고,
  `Image.getSize()`의 원본 비율이 1보다 크면 해당 비율로 줄여 가로 이미지의 전체 구도를 보존한다.
- [세로 이미지의 전체 높이를 표시하면 긴 Post가 피드를 과도하게 점유한다] → frame 높이를 surface 폭으로
  제한하고 `resizeMode="cover"`로 중앙 crop한다. 파생 thumbnail과 fullscreen 정책은 제외 범위로 남긴다.

## Migration Plan

1. PROD-570 위 stacked branch에서 Relay schema/document를 동기화한다.
2. 공용 Media renderer, 목록·상세 연결, Storybook fixture와 검증을 함께 배포한다.
3. 회귀가 있으면 frontend change만 되돌린다. backend schema와 저장 데이터 migration은 없다.

## Open Questions

없음.
