## Why

반응 요약의 People 진입점은 아직 모달을 열어 전용 화면으로 확정된 디자인과 다르다. 기존 조회·페이지네이션을 재사용해 공유 가능한 반응한 사람 화면과 일관된 진입·Back 동작을 제공한다.

## What Changes

- 요약을 한 줄 width-fit과 Ellipsis/+N People 진입점으로 정렬한다.
- 모달을 PageHeader, 선택 Type을 보존하는 pill 필터, Bio 없는 공용 Profile 행의 전용 route로 이관한다.
- URL·직접 진입·Back·프로필 방문 복귀·Viewer 종료와 기존 Relay 조회·재시도·actor 격리를 연결한다.
- 실제 공용 컴포넌트의 Storybook과 최소 동작 테스트를 함께 정렬한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/reaction.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`, `docs/design/reactions.md`, `docs/design/page-header.md`.
- Linear Contract: [PROD-938](https://linear.app/byulmaru/issue/PROD-938)의 포함 범위·완료 조건. 2026-09-12 본문·관계를 조회했고 계약 변경 댓글은 없었다.
- Linear Implementations: PROD-938이 구현·회귀·통합 검증과 이 change의 완료 정합성·archive를 소유한다. PROD-785는 공용 Profile/Follow 기반, PROD-936은 Post presentation, PROD-849는 Compact Viewer의 새 노출을 소유한다.
- 사용자 승인: 2026-09-12 구현계획의 URL query, 직접 진입 fallback, 필터·scroll/focus, 기존 Viewer 진입점 범위와 검증안을 승인했다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post-reaction-ui`: 요약의 width-fit과 People route, 필터·목록·조회 lifecycle을 현재 디자인에 맞춘다.

## Impact

`apps/app`의 ReactionSummary, PostReactionSummary, ReactionProfilesModal과 Profile 목록, pill Tabs, Expo route, shell 및 Viewer 연결, 관련 Storybook·단위 테스트와 `apps/web`의 route E2E가 대상이다. 기존 API·저장 모델·조회 권한·toggle mutation은 유지한다. Full Picker, custom emoji, 재게시/인용 목록 탭, 새 정렬·표시 상한과 범용 navigation/cache 추상화는 포함하지 않는다. PROD-938은 PROD-785 위 Stack으로 구현한다.
