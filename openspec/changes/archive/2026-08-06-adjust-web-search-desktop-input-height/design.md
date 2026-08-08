## Context

현재 PROD-590 구현은 Web `/search`의 도구막대를 모든 breakpoint에서 `64px`, 입력 surface를 `56px`로 사용해 위·아래 `4px` 흰 여백을 만든다. 실제 Web runtime 확인 후 모든 Web breakpoint에서 입력 surface를 `48px`로 맞춰 흰 여백을 위·아래 `8px`로 통일하기로 결정했다.

`SearchScreen`은 이미 `useWindowDimensions()`와 `getShellLayout()`으로 모바일 Web 여부를 계산한다. 검색 상호작용과 route/shell ownership은 현재 구현과 검증을 그대로 유지할 수 있다.

## Goals / Non-Goals

**Goals:**

- 모든 Web breakpoint의 `64px` 도구막대와 본문 시작 위치를 유지한다.
- 모든 Web breakpoint의 입력을 `48px`로 통일한다.
- 입력을 도구막대 안에서 수직 중앙에 두어 위·아래 `8px` 흰 여백을 만든다.
- 세 target viewport의 실제 layout height로 동일한 geometry를 검증한다.

**Non-Goals:**

- 검색 상태, URL, 포커스, history, leading action 또는 drawer 동작 변경
- 도구막대·본문 높이와 가로 geometry 변경
- 공용 breakpoint 또는 `PageHeader` API 추가
- Android/iOS 검색 입력 geometry 변경

## Implementation Guidance

### Current Constraints

- `styles.webInputShell`은 현재 모든 Web breakpoint에 `56px`를 적용한다.
- 입력의 `44×44px` clear action과 leading action target은 `48px` surface 안에 그대로 들어간다.

### Recommended Approach

기존 `styles.webInputShell`의 높이를 `48px`로 바꿔 모든 Web breakpoint에 동일하게 적용한다. 상단바의 `alignItems: 'center'`가 입력을 수직 중앙에 배치하므로 별도 breakpoint style, padding 또는 absolute positioning은 추가하지 않는다.

E2E geometry 표는 `390px`, `900px`, `1400px` 모두 입력 `48px`를 직접 표현하고, 모든 경우 `64px` toolbar와 `y=0`을 계속 검증한다.

### Allowed Alternatives

- `56px` wrapper 안에 `48px` 시각 surface를 추가할 수 있지만 동일한 결과에 불필요한 wrapper와 테스트 계약을 만든다.

### Known Traps

- 상단바를 `68px`로 늘려 본문 시작 위치를 이동하지 않는다.
- breakpoint별로 입력 높이를 다시 분기하지 않는다.
- 시각 surface와 hit area를 별도 wrapper로 분리하지 않는다.
- exact geometry 변경과 무관한 검색 상태·navigation 코드를 수정하지 않는다.

## Risks / Trade-offs

- [입력 높이 감소로 내부 action이 답답해질 수 있다] → `44×44px` action은 유지되고 `48px` 입력 surface 안에 들어가므로 target을 줄이지 않는다.
- [Web breakpoint별 결과가 달라질 수 있다] → 세 viewport와 동일한 expected input height를 같은 test case table에 명시한다.

## Migration Plan

데이터·schema migration은 없다. 공통 Web style과 geometry 기대값을 함께 적용한다. 시각 회귀가 있으면 두 변경을 되돌려 모든 Web breakpoint의 `56px` 입력으로 복구할 수 있다.

## Open Questions

없음.
