## Why

비로그인 사용자가 루트 `/`에서 처음 보는 Welcome 화면은 임시 제품 카피를 사용하고 있으며, full logo가 별도의 84px header에 배치돼 Hero와 분리되어 있다. 현재 Web 렌더에서는 width만 전달한 full logo의 원본 `1050px` 높이가 layout box로 사용되는 증거도 확인됐다. 오픈 베타 배포 전에 제품 정체성, 서비스 상태, 가입·로그인 방식을 부드러운 제품 카피로 설명하고, logo와 Hero를 세 단계 Web viewport에서 일관된 위계로 표시해야 한다.

## What Changes

- 제목을 `동인 창작 문화 향유자를 위한 차세대 연합우주 SNS`로 교체한다.
- 오픈 베타 중 오류나 기능·화면 변경 가능성을 `~요` 어미로 안내한다.
- 별마루 계정 가입·로그인과 가입 시 이메일만 수집하고 이메일 인증으로 로그인한다는 안내를 CTA 아래에 표시한다.
- 별도 84px logo header와 중복 `KOSMO` eyebrow를 제거하고 full logo를 Hero column에 포함한다.
- full logo를 `160×101px` box로 표시하고 화면 상단에서 44px 여백을 둔다.
- 공용 `compact=768`, `full=1280` breakpoint를 사용해 Web 가로 여백을 24/48/128px로 전환한다.
- 기존 `/login` 문서 이동, 유효 세션 `/home` 이동, 세션 오류 시 Welcome 유지와 네이티브 AuthSession을 보존한다.
- 승인된 카피와 geometry를 기존 Web E2E, Figma `05 Screens - Web → 🔑 Onboarding` 1440/1024 frame에 동기화한다.

## Authority / Provenance

- Linear Contract: [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문과 2026-07-31 `확정된 Welcome 카피·배치 계약` 댓글
- Existing design inputs: `docs/design/logo.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`
- Existing behavior contract: `openspec/specs/web-app-shell/spec.md`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 비로그인 root Welcome의 확정 카피, full logo와 Hero 위계, 세 단계 Web 여백과 기존 인증 분기 보존을 추가한다.

## Impact

- `apps/app/src/app/index.tsx`
- `apps/app/src/components/BrandLogo.tsx`
- `apps/app/src/components/BrandLogo.test.ts`
- `apps/web/e2e/auth-routes.e2e.ts`
- Figma `Erj975S6vVP8PlHQius801`, `05 Screens - Web → 🔑 Onboarding`의 1440/1024 frame
- GraphQL document, API, DB schema·migration, dependency 영향 없음

## Out of Scope

- `/home`의 Profile 없음 온보딩
- 로그인·OIDC·세션 판정과 네이티브 세션 교환 내부 변경
- 새로운 로그인·가입 경로와 logo asset 제작
- 개인정보 처리방침 내용, 검색·handle·공용 오류 정책과 다른 route 문구
- 새 375px Figma frame, Android/iOS 실제 기기 QA와 배포 Web smoke 완료 주장
