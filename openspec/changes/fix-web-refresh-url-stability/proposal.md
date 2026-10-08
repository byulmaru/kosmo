## Why

새로고침과 직접 접근 중 주소창이 잠시 다른 경로로 바뀐다. 최종 화면이 정상이어도 사용자는 잘못된 주소를 보고, 같은 시점에 URL을 읽는 분석 도구에도 영향을 줄 수 있다. PROD-1103은 `/home`의 개별 링크가 아니라 공통 Web routing 경계를 수정하도록 요구한다.

## Goal

유효한 정적·동적·중첩 Web route에 직접 접근하거나 새로고침할 때, 초기 로딩과 지연된 Relay 응답 중에도 원래 URL을 유지한다. 기존의 의도된 이동과 인증 redirect는 유지한다.

## What Changes

- 공통 라우터 경계에서 준비되지 않은 navigation state 때문에 잘못된 URL을 기록하는 문제를 수정한다.
- `undefined` 경로, 임의의 게시물·부모 경로, 불필요한 쿼리로의 일시 변경을 모두 검증한다.
- document·pushState·replaceState 전체 이력과 PostHog `$pageview` 결과를 검증한다.

## Non-Goals

- 전체 Expo Router 구조 개편, route 이름 변경, 화면별 URL 우회
- 관련 없는 loading skeleton·화면 디자인 변경, 인증·Profile·Post 권한 변경
- PostHog 수집 재개, taxonomy 변경, 과거 이벤트 삭제·보정, merge·배포

## Constraints

- 유효한 Profile·Post route, 내부 이동, 뒤로가기와 not-found 동작을 보존한다.
- 공유 route tree와 현재 Session·Relay actor 경계를 유지한다. URL 안정화를 이유로 인증 또는 조회 정책을 우회하지 않는다.
- 시각 구조·상태 표현·focus·scroll을 바꾸면 기존 design source와 대조한다.
- 이전 PR #688은 참고 이력이다. 그 PR의 구현 선택·중단 의견·검증 결과를 이번 작업의 승인이나 수정 완료 증거로 상속하지 않는다.

## Verification

- 실제 앱·API와 격리 DB fixture를 사용하는 Web E2E에서 직접 접근과 실제 `page.reload()`를 각각 실행한다.
- 일반 응답과 `UniversalShellQuery` 지연 응답에서 `/home`, `/search`, `/notifications`, `/bookmarks`, `/settings`, `/settings/theme`, Profile Home·following, Post detail·reactions를 확인한다. `/privacy`는 공통 Shell 밖의 비교 경로다.
- 각 문서의 시작부터 준비된 화면까지 전체 URL 이력을 기대 URL과 비교한다. 의도된 `/` → `/home` 또는 guest redirect는 별도 사례로 구분한다.
- 내부 이동·query-only 이동·뒤로/앞으로·missing Profile/Post·query 실패와 retry를 실행해 기존 결과를 확인한다.
- PostHog SDK가 실제로 활성화된 격리 browser 환경에서 전송 payload를 받아 잘못된 `$pageview`가 없는지 확인한다. localhost의 analytics 미초기화 또는 과거 운영 집계는 이 검증을 대신하지 않는다.

## Business Context

- Product canonical: `docs/domain/objects/session.md`의 인증 경계를 보존한다. Web URL 안정화 요구사항의 직접 근거는 PROD-1103이며, 별도 routing ADR은 `docs/domain`의 현재 검색 범위에서 찾지 못했다.
- Visual design source: `docs/design/breakpoints.md`. 기존 Shell·Profile 배치와 scroll·history 상호작용을 보존하는 기준이며 제품 권한의 근거로 사용하지 않는다.
- Operations context: `docs/operations/posthog.md`. analytics 설정과 개인정보·운영 경계를 보존한다.
- Linear: https://linear.app/byulmaru/issue/PROD-1103
- User agreement: PROD-1103 Spec workflow 요청. 수정 방식은 아직 선택하지 않았다.

## Session Status

- Status: Active
- Last updated: 2026-10-09
- Issue scope: Confirmed
- Implementation direction: Pending
- Implementation / runtime verification: Not run
