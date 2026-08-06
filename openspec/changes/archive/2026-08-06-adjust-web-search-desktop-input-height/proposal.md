## Why

PROD-590의 Web runtime 확인에서 검색 입력과 `64px` 도구막대 사이의 흰 여백을 더 분명하게 둘 필요가 확인됐다. 모든 Web breakpoint에서 입력을 `48px`로 맞춰 위·아래 흰 여백을 `8px`로 통일하되, 도구막대와 본문 시작 위치는 유지해야 한다.

## What Changes

- Web `/search`의 `64px` 검색 도구막대 높이는 모든 breakpoint에서 유지한다.
- 모든 Web breakpoint의 검색 입력 높이는 `48px`로 맞춰 위·아래 흰 여백을 `8px`로 통일한다.
- 검색 상태, leading action, drawer, URL·포커스·history와 Android/iOS 동작은 변경하지 않는다.
- PageHeader·breakpoint 디자인 문서와 `web-app-shell` 계약을 새 Web geometry에 맞춘다.

## Authority / Provenance

- Canonical: `docs/design/page-header.md`, `docs/design/breakpoints.md`
- Linear Contract: `PROD-590`
- Product Decision: PROD-590 owner confirmation on 2026-08-06

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: Web 검색 입력 높이를 모든 breakpoint에서 `48px`로 통일한다.

## Impact

- `apps/app/src/app/(tabs)/(protected)/search.tsx`의 Web 입력 높이
- `apps/web/e2e/search.e2e.ts`의 390px·900px·1400px geometry 기대값
- `docs/design/page-header.md`, `docs/design/breakpoints.md`
- 검색 도구막대 높이, 본문 시작 위치, 검색 상호작용, shell ownership, Native와 외부 의존성에는 영향이 없다.
