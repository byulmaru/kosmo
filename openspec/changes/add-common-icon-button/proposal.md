## Why

앱 전역의 single-action compact square control이 production surface마다 `Pressable`과 플랫폼별 target 계산을
직접 소유해 접근성 floor, 상태 전달과 시각 표현이 서로 달라질 수 있다. Profile edit에서 발견한 문제를 특정
화면에 한정하지 않고, 현재 production과 열린 PR에서 확인된 action을 공통 계약으로 통합해야 한다.

## What Changes

- icon, glyph, 짧은 기호 문자 또는 loading indicator를 content로 받는 공통 `IconButton`을 제공한다.
- Web `32×32 CSS px`, iOS `44×44 pt`, Android `48×48 dp` 최소 interaction target을 중앙화하고 public
  override나 caller style로 floor를 낮추지 못하게 한다.
- visual geometry와 interaction target을 분리하고 기존 accessible name·state, focus/ref·event handler,
  pressed·disabled feedback, hit region과 absolute positioning을 보존한다.
- 현재 production의 Profile back·Tag remove, shell menu/back, Post detail back, modal·composer close,
  search clear/delete, media add/remove, ReactionSummary more와 compact Logout action을 공용 component로 옮긴다.
- 열린 PR #486의 FeedbackOverlay close와 PR #510의 PostMediaViewer close/previous/next는 merge 순서에 따라
  먼저 production이 된 action은 이 change가 흡수하고, 아직 열린 PR은 공용 component merge 뒤 자체 branch에서
  전환한다.
- Profile header/avatar whole-preview에 잘못 적용한 `IconButton`과 Profile edit OpenSpec의 PROD-548 소유를
  제거한다.
- 상태형·icon+count·pill·tab·switch, Link·row, whole-preview/content action, compound control과 텍스트
  `Button`은 전환하지 않는다.
- Web 자동화와 runtime으로 현재 출시 surface를 검증한다. iOS·Android mapping은 공용 source에 유지하되
  Native 실제 기기·simulator QA 완료로 간주하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/accessibility.md` 및 각 적용 surface의 기존 `docs/design` 계약
- Linear Contract: [PROD-548](https://linear.app/byulmaru/issue/PROD-548)
- Linear Implementations: `PROD-548`; merge 순서에 따른 소비자 `PROD-594`·`PROD-650`
- Discovery: `PROD-491`, PR #393

## Capabilities

### New Capabilities

- `common-icon-button`: 앱 전역 single-action compact square control의 content, 플랫폼 target, 접근성 상태,
  visual 보존, inventory와 검증 계약

### Modified Capabilities

없음.

## Impact

- Universal client: `apps/app` 공용 UI primitive와 현재 production의 13개 compact action
- Open pull requests: PR #486의 FeedbackOverlay close, PR #510의 PostMediaViewer close/previous/next
- Canonical design: `docs/design/accessibility.md`의 공통 `IconButton` exact contract
- OpenSpec ownership: `add-local-profile-edit`에서 PROD-548를 분리하고 이 change가 cross-surface 완료 증거를 소유
- Verification: component tests, 기존 surface 회귀 테스트, Storybook·Web runtime, 구현 시작·merge 직전 inventory
- API·GraphQL·database·dependency·제품 navigation/persistence/upload 동작 영향 없음
