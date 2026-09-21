## Why

Kosmo Web에는 재게시·반응·북마크의 성공한 행동을 Account 단위로 분석할 명시적 이벤트가 없다. PROD-539는 PostHog 전환 기반을 사용해 기능 사용률·반복 사용·retention 분석에 필요한 행동을 수집하되, 대상과 콘텐츠 식별 정보를 명시적 속성에 넣지 않는다.

## What Changes

- 재게시 생성·취소를 `repost_succeeded`와 `result: "created" | "removed"`로 구분한다.
- 반응 추가·삭제를 `reaction_added`, `reaction_removed`와 `reaction_type: "default" | "custom"`으로 수집한다. 현재 `❤️`만 `default`이며, 나머지 다섯 Type과 향후 별도 기본 반응으로 승인되지 않은 Type은 `custom`이다.
- 북마크 추가·삭제를 별도 명시적 속성 없이 `bookmark_added`, `bookmark_removed`로 수집한다.
- 로그인 뒤 내부 불변 Account ID로 identify된 PostHog identity에 연결한다. Account ID를 이벤트 속성으로 다시 보내지 않는다.
- 서버 확정 성공 결과마다 이벤트를 정확히 한 번 호출하고, payload 부재·실패·network 오류에서는 호출하지 않는다. 분석 장애는 mutation 결과와 기존 사용자 오류 처리를 바꾸지 않는다.
- 명시적 이벤트 속성에는 대상 Post·Profile ID, 선택 Profile ID, Post 콘텐츠, emoji 식별 정보, 오류 원문과 직접 식별 trait를 넣지 않는다. 이 제한을 SDK 표준 이벤트·메타데이터를 제거하는 전역 필터로 확대하지 않는다.
- PostHog 운영 문서의 이벤트 목록과 검증 항목을 갱신하고, 신뢰할 수 있는 Account 가입 이벤트가 없다는 계측 gap을 기록한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`의 재게시 행동, `docs/domain/objects/reaction.md`의 허용 Type·멱등 행동, `docs/domain/objects/bookmark.md`의 개인 저장 행동, `docs/design/post-action-bar.md`, `docs/design/reactions.md`
- Linear Contract: [PROD-539](https://linear.app/byulmaru/issue/PROD-539)의 이벤트 정의·성공 경계·개인정보 경계·포함 및 제외 범위·완료 조건. 2026-09-18 조회 시 본문 수정 시각은 `2026-09-17T11:10:33.039Z`다.
- Supporting Contract: [PROD-795](https://linear.app/byulmaru/issue/PROD-795)의 PostHog 통합·운영 책임, [PROD-819](https://linear.app/byulmaru/issue/PROD-819)의 typed custom event·공개 identify/reset API·fail-open·SDK 표준 동작 경계
- Linear Implementations: PROD-539가 이 change의 계측 구현, 관련 테스트, 기능 이벤트 수집 검증과 완료 정합성 확인을 소유한다.
- 현재 사용자 요청: PROD-539의 Spec 작업. 기존 taxonomy와 개인정보 경계를 최신 Linear에서 다시 확인했으며 새 도메인 행동을 추가하지 않는다.

2026-09-18 기준 PROD-795와 PROD-819는 Done이고 최신 main에는 PostHog adapter가 있다. 다만 [PR #756](https://github.com/byulmaru/kosmo/pull/756)의 수집 중단이 유지되어 dev·prod의 key와 host가 모두 비어 있다. 개인정보 처리방침 [PR #714](https://github.com/byulmaru/kosmo/pull/714)는 Draft다. 이 상태에서도 이벤트 구현과 격리된 자동 검증을 계획할 수 있지만, Done 상태를 수집 재개나 운영 검증 완료의 근거로 사용하지 않는다. PROD-820/819/839/795의 공유 기반·운영 책임은 확대하지 않는다.

PROD-520은 현재 Canceled이며 대체 집계 owner는 확인하지 못했다. 관측 기간·WAA 정의·제외 계정·순사용 계산을 승인된 것으로 가정하지 않으며, 이 change에는 이벤트 기반만 포함한다.

## Capabilities

### New Capabilities

- `post-interaction-analytics`: Web 재게시·반응·북마크 성공 행동의 Account 연계, 이벤트·명시적 속성 계약과 분석 장애 격리

### Modified Capabilities

없음. 기존 change를 갱신하며 같은 이름의 새 change나 공유 기반 change를 만들지 않는다.

## Impact

- `apps/app`: PostHog typed custom event 계약, 기존 Post action의 성공 callback과 관련 테스트
- PostHog 운영 문서: 구현할 때 최신 문서를 확인해 이벤트 목록과 검증 절차를 갱신한다. 조사한 main에는 `docs/operations/posthog.md`가 없으므로 계속 없다면 해당 경로에 이번 이벤트 범위만 작성한다. 기존 `docs/operations/openpanel.md`의 전환·삭제 운영 절차 정리는 PROD-839에 남긴다.
- GraphQL·DB·mutation 연결·Reaction catalog·SDK 의존성 변경은 없다. SDK 전환은 PROD-819의 선행 결과다.
- 이 OpenSpec은 현재 세션의 계획과 검증 메모다. `memory/issue-openspec-workflow.md`에 따라 별도 명세 승인·delta sync·archive를 구현이나 PR 완료 조건으로 추가하지 않는다. 가능한 경우 구현 PR 안에서 `--skip-specs`로 정리하고, 실제로 남은 수집 검증은 handoff에 보존한다. 공유 production acceptance는 PROD-575의 책임이다.
