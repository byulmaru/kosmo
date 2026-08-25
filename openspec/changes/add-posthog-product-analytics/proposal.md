## Why

현재 Kosmo Web 분석 runtime은 완료된 PROD-469의 OpenPanel 계약에 묶여 있어, 최신 PostHog Cloud US 운영 방향과 최소 수집 정책을 적용할 수 없다. PROD-819는 기존 제품 흐름을 막지 않는 PostHog adapter, route 기반 pageview, 제한된 이벤트 payload와 Account identity 수명주기를 독립적으로 전달한다.

## What Changes

- `@openpanel/web` runtime을 제거하고 설정 누락 시 비활성화되는 `posthog-js` Web adapter로 교체한다.
- broad autocapture와 session replay 대신 Expo Router의 안정적인 route template 변화만 `$pageview`로 한 번 수집한다.
- 기존 승인된 명시 이벤트 taxonomy는 유지하되 event별 허용 목록 밖의 속성, URL query·fragment, 자유 형식 사용자 입력과 콘텐츠를 전송 경계에서 제거한다.
- 로그인·Account 전환·로그아웃에서 opaque Account ID의 `identify`와 `reset` 순서를 명시하고 같은 identity의 중복 적용을 막는다.
- SDK 초기화·전송·identity 실패를 렌더링, navigation, 인증과 mutation 결과에서 격리한다.
- Android·iOS 공용 import는 명시적 no-op을 유지하고 Native bundle에 PostHog SDK를 포함하지 않는다.
- 이번 slice는 PostHog Cloud/build 주입, 개인정보 처리방침·runbook, production acceptance·archive, 새 기능 이벤트와 Native SDK를 변경하지 않는다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 문서 없음. `docs/design/breakpoints.md`의 Web/Native platform 경계와 공개 개인정보 처리방침 진입 계약은 유지하며 이번 slice에서 변경하지 않는다.
- Linear Contract: `PROD-795`, `PROD-575`
- Linear Implementations: `PROD-819`(현재 task slice). 같은 change의 `PROD-820`, 후속 `PROD-795`, 최종 acceptance/archive `PROD-575` 책임은 provenance로만 참조하며 이번 tasks에 포함하지 않는다.

## Capabilities

### New Capabilities

- `web-product-analytics`: PostHog Web 초기화, 최소 수집 pageview와 명시 이벤트, Account identity 수명주기, 장애 격리와 Native no-op 경계

### Modified Capabilities

없음. 기존 `add-web-openpanel-product-analytics`는 PROD-575가 대체된 change로 `--skip-specs` archive할 예정이므로, 아직 active spec에 없는 `web-product-analytics`를 새 capability로 정의한다.

## Impact

- `apps/app/src/analytics`: Web provider, payload sanitizer, pageview와 identity 경계 및 관련 단위 테스트
- `apps/app/src/components/AppProviders.tsx`, `apps/app/src/session`: route·Session 수명주기 연결과 검증
- `apps/web/e2e`: Web route, payload, 설정 누락과 fail-open 브라우저 검증
- `apps/app/package.json`, `pnpm-lock.yaml`: `@openpanel/web` 제거와 `posthog-js` 도입
- GraphQL/API, 데이터베이스 schema·migration과 Native SDK에는 영향 없음
