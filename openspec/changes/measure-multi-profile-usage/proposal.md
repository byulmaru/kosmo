## Why

멀티 Profile 기능을 쓸 수 있는 Account의 실제 채택과 전체 제품 안에서의 도달 범위를 구분해 볼 수 없다.
생성·선택·핵심 행동 이벤트는 이미 있지만, Profile 사용 자격과 정확한 전환을 재현할 관측이 부족해 현재
데이터만으로는 승인된 계산식을 만들 수 없다.

## Goal

2026-09-03 승인된 멀티 Profile 지표 계약을 현재 코드와 대조하고, 별도 구현 세션이 사용할 계측·집계·검증
계획을 보완한다. 실제 지표 수집과 대시보드 구성은 구현 이후에 검증한다.

## What Changes

- production Web에서 인증된 화면 조회 시 선택 Profile과 멀티 Profile 자격을 함께 관측한다. 같은 화면을
  유지한 채 새 KST 주차에 WAA 포함 행동이 발생해도 그 주의 자격을 빠짐없이 확인한다.
- Profile 선택 성공 가운데 직접 전환만 구분하고, 첫 선택·재선택·생성 직후 자동 선택·복원·실패는
  전환에서 제외한다.
- 기존 Profile 생성, Post 생성, Follow 실행 성공 관측을 원래 Account와 행동 주체 Profile에 귀속하고 같은
  성공 관측의 재전송을 중복 집계하지 않는다.
- 멀티 Profile 활성 사용률을 주 지표로, WAA 대비 도달률을 보조 지표로 만든다. W+1·W+4 리텐션과 세 집단의
  절대 수도 별도로 제공한다. Profile 생성 총횟수·distinct 생성 Account 수, 직접 전환 총횟수와 전환 0회
  활성 Account를 포함한 평균을 각각 계산한다. 새 Account 생성 이벤트는 추가하지 않는다.
- 같은 버전의 운영 제외 목록을 모든 지표에 적용하고, 합성 자료와 production 실수집 관측으로 계산 계약을
  대조한다.
- OpenSpec은 현재 세션의 계획으로 유지하며, 정리가 유용하면 구현 PR에서 `--skip-specs`로 archive한다.

## Non-Goals

- Profile·Membership·선택 동작과 화면 변경
- 북극성 지표, 다른 진단 지표의 공통 분모, Native 분석과 과거 OpenPanel 수치 이관
- Replay 재활성화, 기본 PostHog 전환의 production 인수

## Constraints

- 현재 canonical 정책과 Linear의 계산식·귀속·제외·개인정보 경계를 유지한다. 추가 수집 금지는 PROD-555의
  custom 속성에 적용하며 기존 SDK standard metadata를 제거하거나 필터링하지 않는다.
- 기존 `me.profiles`, 단일 shell 관측자와 별도 직접 전환 이벤트, 시작 주체·UUID·최초 성공 시각 고정,
  Account × KST week HogQL 집계를 유지한다. 별도 영속 DB나 materialized table을 추가하지 않는다.
- PROD-795는 Done으로 확인했지만 PROD-555 자체 production 대조는 별도로 남는다.
- OpenSpec은 수정 가능한 세션 메모이며 새 요구사항이나 구현 승인 gate를 만들지 않는다.

## Verification

- Spec 단계: 승인된 Review finding 반영, artifact 간 계약, 윤문 전후 계약·구조, OpenSpec strict validation,
  포맷·diff·링크와 handoff를 확인한다.
- 구현 단계: 실제 typed event 전송과 합성 기대표, 저장 쿼리 출력, production 수집과 주간 운영을 대조한다.

## Authority / Provenance

- Canonical: `docs/domain/policies/multi-profile-usage.md`
- Historical Reference: `docs/domain/records/2026-08-31-multi-profile-metrics-contract.md`
- Linear Contract: [PROD-555](https://linear.app/byulmaru/issue/PROD-555)
- Linear Implementations: [PROD-555](https://linear.app/byulmaru/issue/PROD-555)

## Capabilities

### New Capabilities

- `multi-profile-usage-analytics`: 멀티 Profile 자격·사용·전환·핵심 행동 관측과 주간 지표, 리텐션, 운영 검증
  계약

### Modified Capabilities

없음.

## Impact

- Web 앱의 타입이 정해진 분석 이벤트 계약, 인증 shell의 Profile 관측, Profile 생성·선택과 Post·Follow 성공
  호출부
- 분석 단위 검증·Storybook·브라우저 인수 검증과 production 수집 대조
- PostHog의 Insight, 대시보드, 운영 제외 목록과 주간 점검 절차
- 기존 `add-posthog-product-analytics`의 Web 실행 환경과 Account 식별자를 사용하되 그 change의 인수 검증과
  archive 책임은 바꾸지 않는다.
- PROD-795의 개인정보·운영 통합 검증이 production 수집 인수의 선행 조건으로 남는다.

## Session Status

- Status: Active
- Last updated: 2026-09-22
- P0/P1/P2와 구조 결정에 대한 확정 지시를 반영한다. 기존 지표·분모·분자·리텐션·scope는 유지하며 새
  제품 결정은 없다. 구현·실수집 검증은 별도 세션에서 계속한다.
