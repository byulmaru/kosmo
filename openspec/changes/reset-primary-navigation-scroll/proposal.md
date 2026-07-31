## Why

KOSMO Web의 주요 내비게이션은 SPA route를 바꾸면서 이전 document scroll offset을 그대로 남길 수 있어,
스크롤된 화면에서 다른 탭으로 이동하면 대상 화면의 header와 첫 콘텐츠 대신 중간 빈 영역이 먼저 보인다.
Document/window scroll 소유권은 유지하되 forward route 이동, history traversal과 query-only 이동의 정책을
분리해 대상 화면을 예측 가능한 위치에서 시작하게 해야 한다.

## What Changes

- Web 하단 탭, mobile drawer, compact 아이콘 레일과 full sidebar에서 현재와 다른 shell-level 주요 route를
  선택하면 대상 route가 준비된 뒤 document 최상단에서 표시한다.
- 로딩·빈 상태와 연속 route 전환에서도 이전 route의 document scroll offset을 대상 route에 노출하지 않는다.
- 브라우저 뒤로/앞으로 history traversal의 scroll restoration과 검색 화면 query-only 이동의 scroll·focus
  보존을 유지한다.
- 현재 홈 재선택의 최상단 이동·단일 refetch는 `PROD-610` 범위로 유지하고, 다른 현재 route 재선택이나 Relay
  데이터 새로고침을 이 변경에 포함하지 않는다.
- `docs/design/breakpoints.md`와 `web-app-shell` 계약을 Expo Router 기반 Web 동작에 맞게 구체화하고, 가장
  가까운 컴포넌트·브라우저 회귀 검증을 추가한다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`
- Linear Contract: `PROD-619`; 경계 근거 `PROD-219`, `PROD-610`; 통합 검증 소유 `PROD-617`
- Linear Implementations: `PROD-619`이 구현·개별 검증·change 정합성 확인과 archive를 소유한다. `PROD-617`은
  하위 이슈 완료 뒤의 mobile Web 통합 검증만 소유한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 주요 Web forward navigation의 document scroll 초기화, history traversal과 검색 query-only
  이동 보존, 현재 route 재선택의 소유권 경계를 추가한다.

## Impact

- `docs/design/breakpoints.md`
- `apps/app/src/components/shell`의 Web 주요 내비게이션 경계와 관련 컴포넌트 테스트
- `apps/app/src/app/(tabs)`의 Expo Router path/query 구분과 Web route commit 관찰 경계
- `apps/web/e2e`의 mobile Web route scroll, history traversal, 검색 query-only 회귀 검증
- GraphQL schema, Relay 데이터 새로고침 정책, Android/iOS Native navigation, dependency와 migration에는 영향이
  없다.
