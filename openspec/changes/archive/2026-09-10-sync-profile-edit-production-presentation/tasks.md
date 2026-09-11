## 1. PROD-941 Profile Edit Production presentation 동기화

**Authority / Provenance**

- `docs/design/profile-edit.md`
- `docs/design/typography.md`
- `docs/design/icons.md`
- `docs/design/foundations.md`
- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- DSN-45
- PROD-941
- PROD-531의 현재 미완료 이전 경계

**Deliverable**

기존 필드만 사용하는 Production Profile Edit가 승인된 header, typography, spacing과 Mobile·Compact·Full 반응형 이미지 배치를 사용하면서 현재 저장·이미지·실패 복구·navigation 동작을 유지한다.

**Guardrails**

- 기존 controlled presentation과 route·Relay·Media·authorization·navigation 소유권을 유지한다.
- Profile 추가 정보, image crop·pan/zoom·alt text, 새 field와 API·DB·제품 정책을 추가하지 않는다.
- PROD-531이 Settings 이전과 중복 저장 제거를 완료하기 전에는 Follow Approval Switch와 Profile draft/save 연결을 제거하거나 다시 설계하지 않는다.
- Profile Edit 전용 layout을 `PageHeader`나 `ProfileHero`로 통째로 교체하거나 공용 `TextField`·`Avatar` source를 전역 redesign하지 않는다.
- preview 전체를 단일 image edit button으로 유지하고 camera·avatar 내부 표현을 중첩 focus target으로 노출하지 않는다.
- Web 검증을 Android/iOS 실제 runtime 완료 증거로 일반화하지 않는다.

**Verification**

- Mobile `390`, Compact `1024`, Full `1440`에서 header·back/save target, `3:1` preview와 `border/default` 1px 하단선, avatar frame/content/overlap/row와 field spacing을 실행 결과로 검증한다.
- Light/Dark, 긴 입력, validation, saving, image uploading/error와 failure 뒤 draft 보존의 기존 Storybook 동작을 실행한다.
- Profile Edit 관련 unit·Storybook·type/lint/build check와 active `profile-edit-ui` spec strict validation을 통과시킨다.
- Web browser에서 scroll·focus·Back과 responsive visual을 확인하고 Android/iOS에서 실행한 항목과 미실행 항목을 분리해 기록한다.

- [x] 1.1 safe-area 밖 경계를 유지한 `64px` header, title·back·save geometry와 platform별 실제 입력 target을 구현한다.
- [x] 1.2 `3:1` header preview와 `border/default` 1px 하단선을 보존하면서 Mobile과 Compact·Full의 avatar frame·content·overlap·row 및 camera geometry를 동기화한다.
- [x] 1.3 displayName·bio·Profile Tags의 `Label/L`, displayName·bio label-control·control-counter `8px`, Profile Tag root `12px`·내부 row와 chip 좌측 inset `8px`, field section `16px` 위계를 적용하고 기존 input·validation·disabled 동작을 보존한다.
- [x] 1.4 기존 Production component를 사용하는 대표 visual story와 Controls-disabled 자동 계약을 Mobile·Compact·Full, Light/Dark와 영향받는 상태에 맞게 갱신한다.
- [x] 1.5 기존 저장·validation·image menu/upload/retry·draft·Follow Approval·navigation 회귀와 관련 정적 check를 실행한다.
- [x] 1.6 Web browser visual·interaction QA와 가능한 Native 검증을 수행하고 미실행 runtime 증거를 명시한다.
- [x] 1.7 `docs/design/profile-edit.md`와 관련 current inventory를 실제 이관 상태로 갱신하고 OpenSpec strict validation을 통과시킨다.
- [x] 1.8 모든 requirement·task와 완료 증거가 정렬되면 이 change를 canonical spec에 동기화해 archive하고 archive 후 validation을 통과시킨다.

### 검증 기록 · 2026-09-10

- 자동화: `@kosmo/app` unit `521/521`, Profile Edit Storybook `36/36`, Relay compiler와 TypeScript,
  정적 Storybook build가 통과했다.
- Web browser: `390` Light clean, `1024` Light clean, `1440` Dark dirty에서 header·image·field 위계와
  Save disabled/active를 확인했다. `390`에서 입력 변경, keyboard focus, avatar menu open, `Escape` dismiss와
  trigger focus 복귀를 확인했고 긴 상태는 별도 internal scroller 없이 document가 `844 → 980px`로 스크롤됐다.
- Figma: `ProfileEditImageFields` source의 Center `600×200`, Mobile `390×130` header에 `border/default`와
  `border-width/1`을 binding한 하단선을 readback과 screenshot으로 확인했다.
- Native: Android/iOS 실제 기기·simulator는 실행하지 않았다. 공용 `IconButton`·`Button` unit이 iOS `44pt`와
  Android `48dp` mapping을 검증하지만 safe area, touch·focus boundary, font scaling, keyboard, hardware Back,
  VoiceOver·TalkBack runtime 완료 증거로 사용하지 않는다.

### Figma sync repair verification · 2026-09-11

- `pnpm exec prettier --write`로 승인된 소스·스토리·canonical/archive 문서를 정렬했다.
- `pnpm --filter @kosmo/app exec vitest run --project=storybook src/stories/screens/ProfileEdit.tests.stories.tsx`가
  30/30을 통과했다.
- `pnpm --filter @kosmo/app check`가 Relay compiler와 TypeScript를 통과했고,
  `pnpm exec openspec validate --all --strict`가 120/120을 통과했다. 첫 sandbox 실행의 Watchman `fchmod`
  권한 오류는 sandbox 밖 동일 명령 재실행으로 해소했다.
