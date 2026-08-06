## Context

이 기록은 PROD-590 Web runtime 확인 후 검색 도구막대의 breakpoint별 입력 높이를 정렬한다. 기존 `align-web-search-header` archive의 route ownership, `64px` 도구막대와 interaction 결정은 유지한다.

## Decision Records

### 모든 Web 검색 입력은 48px 높이를 사용한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/page-header.md`, `docs/design/breakpoints.md`, `PROD-590`, PROD-590 owner confirmation on 2026-08-06
- Status: Active
- Context / Problem: 모든 Web breakpoint의 `56px` 입력은 `64px` 도구막대 안의 위·아래 흰 여백이 조밀하게 보인다.
- Decision Outcome: `64px` 도구막대는 유지하고 모든 Web breakpoint의 입력은 `48px`, 위·아래 흰 여백은 `8px`를 사용한다.
- Alternatives Considered: 상단바를 `68px`로 늘리는 방식은 본문 시작 위치를 움직여 제외했다. breakpoint별 `56px`/`52px` 입력은 geometry를 불필요하게 분기하고 모바일의 여백을 늘리지 않아 제외했다. `56px` hit wrapper 안에 `48px` 시각 surface를 추가하는 방식은 같은 결과에 불필요한 wrapper와 테스트 계약을 만들어 제외했다.
- Consequences: Web geometry 테스트는 모든 target viewport에서 같은 입력 높이를 검증한다. 검색 상태, shell ownership, navigation, `44×44px` action target과 Native geometry는 변경하지 않는다.
- Confirmation / Follow-up: `390px`, `900px`, `1400px`에서 입력 높이 `48px`와 `64px` toolbar를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `openspec/changes/archive/2026-08-06-align-web-search-header/decisions.md`의 모든 Web breakpoint `56px` 입력 geometry만 이 결정으로 대체한다. route ownership과 나머지 결정은 유지한다.
