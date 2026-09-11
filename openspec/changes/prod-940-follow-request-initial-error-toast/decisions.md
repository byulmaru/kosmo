## Context

이 기록은 PROD-940과 `docs/design/figma.md`가 정한 `/follow-requests` Initial error Target, 기존 Follow Request 관리 계약과 현재 app-level Toast·Relay actor 수명주기를 반영한다.

## Decision Records

### 최초 조회 오류만 skeleton과 재시도 Toast로 이관한다

- Decision Date: 2026-09-11
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/figma.md`, `docs/design/storybook.md`, `PROD-940`
- Status: Active
- Context / Problem: 현재 최초 query 오류는 중앙 `StateView`를 표시하며 승인된 Mobile Target과 다르고, app-level Toast는 route와 actor가 바뀌어도 별도로 정리하지 않으면 남을 수 있다.
- Decision Outcome: 최초 조회 실패 동안 skeleton을 유지하고 persistent Danger Toast에서 같은 query를 재시도한다. 성공, route 이탈과 selected Profile 전환에서는 이 surface가 만든 Toast를 정리하며, 재실패에는 같은 오류를 다시 제공한다.
- Alternatives Considered: 중앙 오류 상태 유지, 전역 Toast dismiss, row·pagination 오류까지 함께 이관. 각각 승인된 Target 불충족, 다른 Toast 소유권 침범, PROD-940 제외 범위 확대 때문에 선택하지 않는다.
- Consequences: 최초 query 오류 presentation과 직접 검증만 바뀌며 승인·거절 행, pagination, API·Relay cache 계약은 유지된다.
- Confirmation / Follow-up: 실제 production route 기반 테스트와 Storybook Tests story에서 retry 성공·재실패·중복 입력·actor cleanup을 확인하고, Web route 이탈을 확인한다. Native runtime QA 미실행 항목은 PROD-699 경계와 함께 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
