# Web 검색 입력 높이 조정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 Web `/search`의 `64px` 도구막대 안에서 검색 입력을 `48px`로 줄여 위·아래 흰 여백을 `8px`로 만든다.

**Architecture:** 기존 `styles.webInputShell` 높이를 `48px`로 바꿔 모든 Web breakpoint에 동일하게 적용한다. 상호작용과 shell ownership은 변경하지 않고 기존 Web E2E geometry 표에서 세 viewport의 동일한 기대값을 검증한다.

**Tech Stack:** Expo Router, React Native Web `StyleSheet`, Playwright, OpenSpec

## Global Constraints

- 모든 Web breakpoint의 검색 도구막대는 `64px`, `y=0`을 유지한다.
- 모든 Web breakpoint의 검색 입력은 `48px`다.
- 검색 상태, `q`·`tab`, 포커스·history, leading action, drawer, Android/iOS geometry를 변경하지 않는다.
- 새 breakpoint, dependency, helper, wrapper 또는 test infrastructure를 추가하지 않는다.

---

## 1. PROD-590 Web 입력 geometry

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `PROD-590`
- PROD-590 owner confirmation on 2026-08-06

**Deliverable**

모든 Web breakpoint의 입력은 `48px`를 사용하며, 도구막대와 본문 시작 위치는 유지된다.

**Guardrails**

- 테스트 코드 범위: `apps/web/e2e/search.e2e.ts`의 기존 세 viewport geometry test 하나.
- 테스트 필요성: 390px·900px·1400px의 입력 높이가 모두 `48px`이고 toolbar `64px`·`y=0`이 유지됨을 관찰 가능한 layout으로 직접 증명한다.
- 테스트 제외 범위: interaction test 추가, 중복 viewport, 새 fixture·helper·snapshot·Storybook test와 테스트 인프라 변경.

**Files**

- Modify: `apps/web/e2e/search.e2e.ts:61`
- Modify: `apps/app/src/app/(tabs)/(protected)/search.tsx:499`
- Modify: `apps/app/src/app/(tabs)/(protected)/search.tsx:681`

**Interfaces**

- Consumes: `styles.webInputShell`
- Produces: 모든 Web breakpoint에 적용되는 `48px` 입력 surface

- [x] **Step 1: 모든 target viewport에 48px 기대값을 가진 실패 E2E를 작성한다**

  기존 case table을 `[[390, 48], [900, 48], [1_400, 48]] as const`로 바꾸고 각 case의 `inputHeight`를 기대값으로 사용한다. `toolbarHeight: 64`, `toolbarY: 0` assertion은 유지한다.

- [x] **Step 2: 변경 전 E2E가 모바일의 56px 실제값 때문에 실패하는지 확인한다**

  Run: 기존 Web E2E database wrapper로 `apps/web/e2e/search.e2e.ts`를 실행한다.

  Expected: 390px case가 `inputHeight: 56`으로 실패한다.

- [x] **Step 3: 공통 Web 48px style을 최소 구현한다**

  `styles.webInputShell`의 높이를 `48px`로 바꾸고 breakpoint별 `desktopWebInputShell` override를 제거한다. 다른 style과 event handler는 변경하지 않는다.

- [x] **Step 4: scoped E2E와 정적 검증을 통과시킨다**

  Run: 기존 Web E2E database wrapper로 `apps/web/e2e/search.e2e.ts` 실행

  Expected: 16/16 pass, geometry case는 세 viewport 모두 `48px`를 반환한다.

  Run: `pnpm --filter @kosmo/app check`

  Expected: Relay compilation과 `tsc --noEmit` exit 0.

- [x] **Step 5: 실제 CI preview geometry를 확인한다**

  `CI=true`와 `/private/tmp/prod590-metro-beac.cjs` override로 dev preview를 재시작한 뒤 `/search`에서 390px·900px·1400px 입력과 toolbar bounding box를 확인한다.

  Expected: toolbar는 모두 `64px`, input은 모두 `48px`; 흰 여백은 위·아래 `8px`다.

## 2. PROD-590 OpenSpec 정합성과 완료 검증

**Authority / Provenance**

- `docs/design/page-header.md`
- `docs/design/breakpoints.md`
- `PROD-590`

**Deliverable**

디자인 문서와 OpenSpec delta가 구현·테스트와 같은 breakpoint별 geometry를 설명하고 strict validation을 통과한다.

**Guardrails**

- 기존 `2026-08-06-align-web-search-header` archive는 역사 기록으로 수정하지 않는다.
- active change 완료·archive와 Draft PR push는 구현 검증 뒤 사용자 확인을 받는다.
- PR Ready 전환, Linear 상태 변경, merge는 범위 밖이다.

**Files**

- Modify: `docs/design/page-header.md`
- Modify: `docs/design/breakpoints.md`
- Create: `openspec/changes/adjust-web-search-desktop-input-height/`

**Interfaces**

- Consumes: canonical `web-app-shell`의 `Web 검색 상단바 geometry와 소유권` requirement
- Produces: 모든 Web breakpoint의 `48px`를 정의하는 MODIFIED delta requirement

- [x] **Step 1: OpenSpec active change를 strict mode로 검증한다**

  Run: `./node_modules/.bin/openspec validate adjust-web-search-desktop-input-height --strict`

  Expected: 1 passed, 0 failed.

- [x] **Step 2: 구현 후 관련 formatting과 diff를 확인한다**

  Run: 변경 파일 Prettier check와 `git diff --check`

  Expected: formatting error와 whitespace error 없음.

- [x] **Step 3: 독립 구현 리뷰와 사용자 시각 확인을 받는다**

  Expected: 승인 geometry 밖의 regression finding이 없고 사용자가 모든 Web breakpoint의 위·아래 `8px` 여백을 확인한다.

- [x] **Step 4: 승인 뒤 checkpoint commit·push와 Draft PR 본문을 갱신한다**

  커밋·push 대상은 이 계획의 source, E2E, canonical design docs와 active OpenSpec change로 제한한다. `.superpowers/**`와 `docs/superpowers/**`는 포함하지 않는다.
