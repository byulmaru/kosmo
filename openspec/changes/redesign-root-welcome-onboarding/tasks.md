## 1. DSN-26 OpenSpec Gate

**Authority / Provenance**

- [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문과 2026-07-31 `확정된 Welcome 카피·배치 계약` 댓글

**Deliverable**

승인된 카피, full logo·Hero 위계, 세 단계 Web 여백, 보존할 auth/session과 제외 범위를 구현 전에 검증 가능한 `web-app-shell` 계약으로 정렬한다.

**Guardrails**

- 모든 requirement와 decision은 DSN-26과 기존 logo/breakpoint/auth 계약에서 파생한다.
- OpenSpec을 제품 카피나 새 범위를 처음 결정하는 장소로 사용하지 않는다.
- 코드 편집 전에 strict validation과 사용자 OpenSpec Gate 승인을 받는다.

**Verification**

- `pnpm exec openspec validate redesign-root-welcome-onboarding --strict`
- `pnpm exec prettier --check openspec/changes/redesign-root-welcome-onboarding`

- [x] 1.1 proposal, delta spec, design, decisions와 tasks를 DSN-26 authority에 맞게 작성한다.
- [x] 1.2 strict validation과 Prettier를 통과시키고 requirement·decision·task ownership을 한국어로 설명해 사용자 승인을 받는다.

## 2. DSN-26 full logo geometry

**Authority / Provenance**

- [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문과 2026-07-31 확정 댓글
- `docs/design/logo.md`

**Deliverable**

`BrandLogo` full variant가 입력 width로부터 1665:1050 비율의 명시적 height를 계산해 Web에서 원본 1050px 높이를 layout box로 사용하지 않는다.

**Guardrails**

- mark variant square geometry와 accessible name을 유지한다.
- 새 prop, platform branch, asset 또는 dependency를 추가하지 않는다.
- 테스트 코드 범위: 기존 `BrandLogo.test.ts`의 full variant geometry assertion.
- 테스트 필요성: 첨부 Chrome 증거의 136×1050 Web layout 회귀를 공용 component 경계에서 막는다.
- 테스트 제외 범위: 새 harness, snapshot, Storybook interaction과 asset test 중복.

**Verification**

- `pnpm --filter @kosmo/app exec node --experimental-test-module-mocks --import tsx --test src/components/BrandLogo.test.ts`
- `pnpm --filter @kosmo/app check`

- [ ] 2.1 full variant test를 명시적 calculated height expectation으로 바꾸고 기존 구현에서 실패를 확인한다.
- [ ] 2.2 full variant style에 calculated height를 구현하고 focused test와 app check를 통과시킨다.

## 3. DSN-26 Welcome production UI와 Web E2E

**Authority / Provenance**

- [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문과 2026-07-31 확정 댓글
- `docs/design/breakpoints.md`, `docs/design/logo.md`
- 기존 root auth 계약 [PROD-226](https://linear.app/byulmaru/issue/PROD-226)

**Deliverable**

루트 Welcome이 full logo와 승인된 heading·beta·account copy를 하나의 Hero column에 표시하고, 세 단계 Web 여백과 기존 login/session/privacy 동작을 유지한다.

**Guardrails**

- `/home` 온보딩, auth/OIDC/session 내부, 새 route·asset, privacy 내용과 다른 route copy를 바꾸지 않는다.
- Android/iOS는 24px 가로 여백을 사용하고 native AuthSession을 유지한다.
- 테스트 코드 범위: 기존 `auth-routes.e2e.ts`의 guest/session/OIDC와 375/1024/1440 geometry.
- 테스트 필요성: 승인 카피, x/y/size, CTA destination과 auth regression을 관찰 가능한 결과로 검증한다.
- 테스트 제외 범위: 새 fixture/helper/harness, screenshot golden, Storybook interaction, 전체 navigation suite와 Android/iOS 자동화.

**Verification**

- focused auth route E2E
- `pnpm --filter @kosmo/app check`
- targeted ESLint와 Prettier

- [ ] 3.1 guest/session E2E를 승인 카피로 갱신하고 375/1024/1440 logo·heading geometry test를 추가해 기존 구현에서 실패를 확인한다.
- [ ] 3.2 root route에서 별도 header·eyebrow와 1024px 분기를 제거하고 통합 Hero, 승인 카피와 공용 breakpoint padding을 구현한다.
- [ ] 3.3 focused E2E, app check, ESLint와 Prettier를 통과시킨다.

## 4. DSN-26 Figma, 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문과 2026-07-31 확정 댓글
- `docs/design/figma.md`

**Deliverable**

production 구현을 375/1024/1440 Web에서 검증하고 Figma 1440/1024 Onboarding frame과 동기화한 뒤 전체 계약·구현·검증 증거가 일치할 때 change를 archive한다.

**Guardrails**

- Figma file `Erj975S6vVP8PlHQius801`, `05 Screens - Web → 🔑 Onboarding`의 기존 1440/1024 frame만 수정한다.
- 375 Figma frame, unrelated component/screen과 외부 library token을 추가하지 않는다.
- 자동화, local browser, Figma, 배포 Web와 Android/iOS 실제 기기 QA를 서로 다른 검증 증거로 보고한다.
- 모든 requirement와 task가 완료되기 전에는 change를 archive하지 않는다.

**Verification**

- 375×812, 1024×900, 1440×900 local browser smoke와 screenshot
- Figma updated node read-back과 1440/1024 screenshot
- app check, BrandLogo unit, auth route E2E, targeted lint/format
- archive 전 `pnpm exec openspec validate redesign-root-welcome-onboarding --strict`
- archive 후 `pnpm exec openspec validate --all --strict`

- [ ] 4.1 local Web 세 viewport에서 logo x/y/size, heading alignment, copy·CTA·privacy, overflow를 확인한다.
- [ ] 4.2 Figma Onboarding 1440/1024 frame을 production 구현과 동기화하고 node read-back·screenshot을 확인한다.
- [ ] 4.3 전체 자동화와 독립 implementation review를 통과시키고 local/Figma/deployed/native 검증 경계를 기록한다.
- [ ] 4.4 canonical·Linear·delta spec·구현과 다른 active `web-app-shell` change를 재대조한 뒤 전체 scope가 complete일 때 archive하고 post-archive strict validation을 통과시킨다.
