## Context

현재 Expo `/search` route는 `q`, `tab`, 입력 포커스와 `before`·`input`·`results` 상태를 소유한다. route의 scroll content 전체에는 상하 `32px`, 좌우 `24px` 여백이 있고 검색 도구막대는 `56px`, 입력 surface는 `44px`다. 모바일 Web 셸은 `/search`를 별도 소유 route로 분류하지 않아 route 도구막대 위에 `64px` 메뉴 전용 헤더를 추가한다.

모바일 drawer 상태와 왼쪽 edge swipe는 `UniversalShell`이 소유하며, Slot 아래 route가 셸 동작을 호출하는 기존 context 경계는 profile switch action만 제공한다. 공용 `PageHeader`는 text·brand variant만 지원하고 검색 입력을 center content로 받지 않는다. 검색 초기화, 입력 내부 지우기, query-only navigation의 위치·포커스와 browser history 복원은 이미 route와 primary navigation context에 구현되어 있다.

## Goals / Non-Goals

**Goals:**

- 검색 상태 ownership을 route에 유지하면서 모든 Web breakpoint의 검색 도구막대를 `64px`/`56px` geometry로 정렬한다.
- 모바일 Web에서 셸의 중복 메뉴 헤더를 제거하고 route leading action으로 drawer를 열 수 있게 한다.
- 도구막대 바깥 여백과 아래 콘텐츠 여백을 분리한다.
- 기존 검색 URL·포커스·history와 shell edge swipe 계약을 회귀 없이 유지한다.

**Non-Goals:**

- 검색 API, 결과 데이터, 랭킹, 필터 또는 탭 정책 변경
- 공용 `PageHeader` API 확장이나 sidebar·right rail 재설계
- Android/iOS 검색 헤더 변경
- query navigation 또는 drawer gesture 구조의 일반화

## Implementation Guidance

### Current Constraints

- 모바일 Web의 최초 검색 상태에는 route 안에 drawer trigger가 필요하지만 drawer state는 셸 내부에 있고 route가 호출할 공개 action이 없다.
- 셸이 검색 phase를 직접 소유하면 route의 `q`·`tab`·포커스 state와 중복되고 query navigation 복원 경계를 깨뜨릴 수 있다.
- scroll content root의 여백만 제거하면 최근 검색·탭·결과·empty 상태의 본문 여백도 함께 사라진다.
- `/search`의 셸 헤더를 모든 플랫폼에서 억제하면 Native에 의도하지 않은 변경이 생긴다.

### Recommended Approach

검색 route가 도구막대와 검색 phase를 계속 소유한다. 기존 shell chrome context는 route가 모바일 navigation drawer를 여는 데 필요한 좁은 capability와 trigger semantics를 제공하고, 셸은 drawer state·Modal·edge swipe를 계속 소유한다. 모바일 Web `/search`에서는 셸의 기본 메뉴 전용 헤더만 렌더링하지 않으며 하단 탭과 drawer gesture는 기존 셸 구조에 남긴다.

검색 도구막대와 아래 콘텐츠의 layout wrapper를 분리한다. 도구막대는 중앙 컬럼 상단에서 `64px` 높이와 내부 `56px` 입력 surface를 사용하고, 아래 상태 콘텐츠 wrapper가 기존 본문 여백을 소유한다. 모바일 Web 최초 상태에서만 drawer trigger를 leading slot에 렌더링하고, 입력 중·결과 상태와 compact/full Web의 기존 검색 초기화 동작은 현재 route navigation을 재사용한다.

기존 검색 submit, clear, back, tab 전환과 query-only navigation 함수는 geometry 변경에 필요하지 않은 한 유지한다. 셸의 route header ownership 판정은 기존 breakpoint·pathname helper와 같은 테스트 가능한 경계에서 `/search` 예외만 표현한다.

### Allowed Alternatives

- 동일한 spec과 ownership을 지키는 한 shell chrome context를 확장하는 대신 drawer action 전용 context를 둘 수 있다. 다만 별도 context가 실제 책임 분리를 제공하지 않는다면 기존 provider 확장을 우선한다.
- 검색 도구막대 내부 layout은 route에 머무르는 한 작은 표시 컴포넌트로 분리할 수 있지만, 단일 사용처를 위한 추상화는 기본 경로가 아니다.

### Known Traps

- 검색 phase를 셸로 끌어올리거나 셸과 route 양쪽에서 복제하지 않는다.
- 공용 `PageHeader`에 임의의 center slot을 추가해 기존 text·brand geometry와 접근성 범위를 넓히지 않는다.
- 입력 내부 지우기와 검색 초기화 뒤로가기의 포커스 차이를 하나의 handler로 합치지 않는다.
- 모바일 Web 헤더 억제를 Native 또는 compact/full Web에 적용하지 않는다.
- geometry 검증을 viewport 스크린샷만으로 끝내지 않고 실제 도구막대와 입력 영역의 layout 크기를 확인한다.

## Risks / Trade-offs

- [Route가 shell drawer action을 호출하면서 context contract가 넓어진다] → drawer state·gesture·Modal ownership은 셸에 유지하고 route에는 trigger에 필요한 최소 capability만 노출한다.
- [Root 여백 분리로 검색 상태별 본문 위치가 달라질 수 있다] → before·input·results 각각에서 동일한 content wrapper를 사용하고 세 target viewport의 실제 geometry를 검증한다.
- [모바일 검색 trigger가 기존 셸 trigger의 접근성 의미를 잃을 수 있다] → 같은 accessible name, role, `44×44px` target과 drawer 상태 의미를 유지한다.
- [Playwright pointer 입력이 실제 touch PanResponder와 다를 수 있다] → 자동화 가능한 gesture 검증을 우선하고 실제 Web runtime에서 edge swipe를 별도 확인해 증거 범위를 구분한다.

## Migration Plan

데이터·schema migration은 없다. 디자인 문서와 OpenSpec을 먼저 정렬하고, route geometry와 셸 ownership을 한 구현 slice로 배포한다. 회귀가 발생하면 route의 body wrapper와 모바일 `/search` header 예외를 함께 되돌려 기존 중복 헤더 구조로 복구할 수 있다.

## Open Questions

없음.
