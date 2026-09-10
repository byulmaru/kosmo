## Why

DSN-45에서 확정한 Profile Edit의 header, field 위계와 반응형 이미지 배치가 Production의 기존 `ProfileEditScreen`·`ProfileEditForm`에 아직 반영되지 않아 Storybook과 실제 route가 이전 `48px` header와 고정 `96px` avatar 계약을 유지하고 있다. PROD-941은 신규 Profile 기능을 도입하지 않고 기존 필드와 저장 흐름을 보존한 채 이 시각·접근성 계약만 Production에 이관한다.

## What Changes

- safe area를 제외한 Profile Edit header를 `64px`로 맞추고 `44×44` visual target의 `ArrowLeft` `24px`를 사용하되 Android의 최소 `48dp` 입력 target을 유지한다.
- header preview의 기존 `3:1` 비율을 유지하면서 avatar frame을 Mobile `96px`, Compact·Full `128px`로 반응형 배치하고 camera affordance를 canonical `20px` glyph와 `40px` surface에 맞춘다.
- displayName, bio와 Profile Tags의 외부 label을 `Label/L`로 맞추고 label-control `8px`, field section `16px` 위계를 적용한다.
- 기존 저장·validation·image menu/upload·failure recovery·draft/navigation 동작과 `600px` 중앙 surface를 유지하며 Mobile `390`, Compact `1024`, Full `1440`의 Light/Dark·상태 Storybook 증거를 갱신한다.
- PROD-531이 완료되기 전 현재 Production의 Follow Approval Switch와 같은 draft/save 소유권을 유지한다.
- `docs/design/profile-edit.md`의 Candidate/Production 경계와 적용되는 `profile-edit-ui` 계약을 실제 이관 상태에 맞춘다.

## Authority / Provenance

- Canonical: `docs/design/profile-edit.md`, `docs/design/typography.md`, `docs/design/icons.md`, `docs/design/foundations.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`
- Linear Contract: DSN-45
- Linear Implementations: PROD-941; Follow Approval 이전 경계는 PROD-531

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile-edit-ui`: 기존 Profile Edit presentation의 header, responsive avatar, field label·spacing과 platform별 back target 요구사항을 DSN-45·PROD-941 계약으로 갱신한다.

## Impact

- App presentation: `ProfileEditScreen`, `ProfileEditForm`, `ProfileEditImageFields`, `ProfileTagEditor`
- Storybook: 기존 Profile Edit의 responsive·Light/Dark·validation·saving·image 상태와 자동 interaction/geometry 검증
- Documentation/spec: `docs/design/profile-edit.md`, `profile-edit-ui`
- 영향 없음: GraphQL/API/DB, Relay와 route authorization, Media upload lifecycle, Profile 추가 정보, image crop·alt text, Follow Approval Settings 이전
