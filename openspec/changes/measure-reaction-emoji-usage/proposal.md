## Why

기존 `reaction_added`·`reaction_removed`에는 `reaction_type`만 있어 Reaction 종류별 사용 Account 수와 반복 사용량을 비교할 수 없다. PROD-942가 준비하는 Full Emoji 범위에 맞춰 분석 정보만 추가한다.

## Goal

Web에서 지원되는 Unicode Reaction 종류별로 사용 Account 수, 추가·제거 횟수와 반복 사용량을 같은 기준으로 재현할 수 있다.

## What Changes

- 기존 성공 이벤트에 검증된 Unicode 종류 식별값과 Unicode/사용자 정의 구분을 추가한다. 기존 `reaction_type`과 Account identity를 유지한다.
- 종류별 계산식, 관측 범위와 해석 한계, 최소 PostHog Insight 또는 재현 가능한 쿼리를 마련한다.
- 명시적 event property의 경계를 정리하고 운영 문서·공개 고지와의 정합성 확인을 기록한다.

## Non-Goals

- PROD-942의 Reaction catalog, 허용 범위, Picker, mutation 또는 Unicode 동일성 계약을 다시 정의하지 않는다.
- 사용자 정의 emoji의 개별 식별 정보 수집, Native 계측, 과거 데이터 backfill, PostHog production 수집 재개와 배포를 다루지 않는다.

## Constraints

- PROD-942 PR #1023·#1025를 선행 Stack으로 사용한다. 선행 계약이 바뀌면 의존하는 analytics 경계만 다시 검증한다.
- PROD-539의 기존 이벤트·성공 경계와 PROD-795의 Account identity·SDK 경계를 따른다. 별도 중복 이벤트와 금지된 사용자·콘텐츠 property를 추가하지 않는다.
- PR #1023·#1025가 미병합인 동안 PROD-986 PR을 Draft로 유지한다.

## Verification

- 선행 기능이 허용하는 전체 종류가 누락·충돌 없이 분석 key에 대응하는지 확인한다.
- 성공·실패·늦은 응답·Account 전환·분석 장애에서 실제 event payload와 제품 결과를 검증한다.
- 여러 Profile을 가진 Account와 반복 사용 사례로 distinct Account와 event 횟수·분포를 재현한다.
- 운영 event 목록과 고지 검토 결과를 확인하고, Web·수집 공백·key 없는 과거 데이터의 해석 한계를 표시한다.

## Business Context

- Canonical: `docs/domain/objects/reaction.md`, `docs/design/reactions.md`, `docs/operations/posthog.md`.
- Linear: [PROD-986](https://linear.app/byulmaru/issue/PROD-986), [PROD-942](https://linear.app/byulmaru/issue/PROD-942), [PROD-539](https://linear.app/byulmaru/issue/PROD-539).
- User agreement: PROD-942의 두 PR 위에 delta layer를 쌓고 Spec까지만 진행한다.

## Session Status

- Status: Active
- Last updated: 2026-09-27
