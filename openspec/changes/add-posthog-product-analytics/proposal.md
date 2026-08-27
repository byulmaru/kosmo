## Why

현재 Kosmo Web 분석 runtime은 완료된 PROD-469의 OpenPanel 계약에 묶여 있어, 최신 PostHog Cloud US 운영 방향과 최소 수집 정책을 적용할 수 없다. PROD-819는 기존 제품 흐름을 막지 않는 PostHog adapter, SDK history-change pageview, typed 이벤트 계약과 Account identity 수명주기를 독립적으로 전달한다.

## What Changes

- `@openpanel/web` runtime을 제거하고 설정 누락 시 비활성화되는 `posthog-js` Web adapter로 교체한다.
- 초기 PostHog 기반 단계(PROD-819·PROD-795)에서는 broad autocapture와 Session Replay를 비활성화하고 PostHog SDK의 `capture_pageview: 'history_change'`를 기본으로 사용한다. SDK pageview의 `$pathname`은 유지하고 current URL·query·hash·referrer 등 불필요한 URL metadata만 제한한다. 후속 PROD-741 활성화 단계에서는 production canonical origin의 Web Session Replay를 10% sample로 켠다.
- PROD-741 활성화 단계에서 모든 `input`·`textarea` 값과 canonical Post Content renderer의 본문 텍스트를 replay에서 마스킹하며, 초기 보존 기간은 30일로 검증한다. 추가 custom selector는 이 change의 현재 완료 조건에 포함하지 않는다.
- Session Replay 보존 기간 변경은 현재 PostHog 플랜이 지원하는 범위 안에서 운영 설정으로 허용한다. 실제 값·적용 시점·변경 근거를 기록하고, 플랜 변경만으로 자동 연장하지 않으며, 변경은 설정 이후 수집된 replay에만 적용한다.
- 기존 승인된 명시 이벤트 taxonomy는 event별 discriminated TypeScript 계약으로 유지하고 typed properties를 PostHog `capture`에 그대로 전달한다. 별도 runtime allowlist·projection·unknown-event drop schema는 두지 않으며 app caller가 URL query·fragment, 자유 형식 사용자 입력과 콘텐츠를 전달하지 않게 한다.
- 로그인·Account 전환·로그아웃에서 opaque Account ID의 `identify`와 `reset` 순서를 명시하고 같은 identity의 중복 적용을 막는다.
- SDK 초기화·전송·identity 실패를 렌더링, navigation, 인증과 mutation 결과에서 격리한다.
- Android·iOS 공용 import는 명시적 no-op을 유지하고 Native bundle에 PostHog SDK를 포함하지 않는다.
- 이번 `PROD-819` implementation slice는 PostHog Cloud/build 주입, 개인정보 처리방침·runbook, phased Session Replay 활성화·보존 설정, production acceptance·archive, 새 기능 이벤트와 Native SDK를 직접 구현하지 않는다. 같은 change의 PROD-820·PROD-795·PROD-741·PROD-575가 각 설정·cross-slice 검증·활성화·최종 acceptance/archive 책임을 소유한다.

## Authority / Provenance

- Canonical: 적용되는 `docs/domain` 문서 없음. `docs/design/breakpoints.md`의 Web/Native platform 경계와 공개 개인정보 처리방침 진입 계약은 유지하며 이번 slice에서 변경하지 않는다.
- Linear Contract: `PROD-819`, `PROD-820`, `PROD-795`, `PROD-741`, `PROD-575`
- Linear Implementations: `PROD-819`(그룹 2·3·4 provider·pageview·identity slice)와 `PROD-820`(그룹 1·5 Cloud·retention 지속 계약) 이후 `PROD-795`(그룹 6·7 cross-slice 검증, PROD-741 block), `PROD-741`(그룹 8 production replay 활성화·마스킹·초기 30일 검증), `PROD-575`(최종 acceptance/archive) 순서로 인계한다.

## Capabilities

### New Capabilities

- `web-product-analytics`: PostHog Web 초기화, phased Session Replay와 retention, SDK pageview와 typed 명시 이벤트, Account identity 수명주기, 장애 격리와 Native no-op 경계

### Modified Capabilities

없음. 기존 `add-web-openpanel-product-analytics`는 PROD-575가 대체된 change로 `--skip-specs` archive할 예정이므로, 아직 active spec에 없는 `web-product-analytics`를 새 capability로 정의한다.

## Impact

- `apps/app/src/analytics`: Web provider, event type contract, SDK pageview와 identity 경계 및 관련 단위 테스트
- `apps/app/src/components/AppProviders.tsx`, `apps/app/src/session`: Session 수명주기 연결과 검증
- `apps/web/e2e`: Web payload, 설정 누락과 fail-open 브라우저 검증
- `apps/app/package.json`, `pnpm-lock.yaml`: `@openpanel/web` 제거와 `posthog-js` 도입
- GraphQL/API, 데이터베이스 schema·migration과 Native SDK에는 영향 없음
