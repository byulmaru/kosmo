## Why

순수 Repost가 Quote의 본문만 보여주면 인용 원문을 전제로 쓴 내용을 이해하기 어렵다.
PROD-922와 ADR 0027에서 승인한 한 단계 preview를 공용 목록에 반영하기 위해 구현·검증 계획을 복원한다.

## Goal

A가 Quote B를 Repost하고 B가 C를 인용하면, A의 attribution 아래 B의 표준 Author·생성 시각·Content와
C preview를 표시한다. C도 Quote이면 C의 내용까지만 표시한다.

## What Changes

- 기존 Home·Profile 공용 목록과 Bookmark 소비 fixture에서 같은 표시 깊이를 확인한다.
- 공용 renderer와 Relay fragment를 조정하고, 목록·상세·이동·동작 대상의 회귀 검증을 마련한다.
- 이 세션은 명세와 handoff를 남긴다. 구현과 실행 검증은 다음 세션에서 수행한다.

## Non-Goals

새 목록 후보, Bookmark 저장 정책, Quote 작성, 원격 Quote 승인·철회·resolution, Repost 저장·생성·취소,
Notification, federation, 게시 활동 목록은 제외한다. 완료된 PROD-415·PROD-453·PROD-505를 재개하지 않는다.

## Constraints

- 바깥 article·padding·row divider·Action Bar·Reaction Summary를 한 번만 두고 C 아래 D·placeholder·CTA를 만들지 않는다.
- B 본문·생성 시각과 A의 상세 URL은 B 상세로, C 본문·생성 시각은 C 상세로, 각 Author는 자기 Profile로 이동한다.
- Repost·Reaction·Bookmark·More·Reaction Summary는 B를 대상으로 하며, Reply는 바깥 A의 binding과 disabled 상태를 유지한다.
- C가 nullable이면 C 카드만 생략한다. B 자체가 조회 불가이면 기존 Eligibility에 따라 A를 제외한다. 숨겨진 Source를 우회 조회하지 않는다.
- 외부 Link와 Post 이동을 함께 실행하지 않는다. preview 전체나 빈 padding을 Link로 감싸지 않는다. 기존 Content Warning·Media 표현을 유지한다.
- Native 공용 계약을 유지한다. Web 검증과 Native touch·VoiceOver·TalkBack 출시 전 관찰을 구분한다.

## Verification

A→B→C와 A→B→C→D cutoff, B/C unavailable, 각 이동·동작 대상, 단일 article·Action Bar,
A URL의 B 상세 replace redirect를 실행 결과로 검증한다. 기존 Quote·Reply+Quote 목록·상세·thread를
회귀 검증하고, Web Light·Dark·좁은/넓은 viewport·긴 본문/Author·keyboard/focus를 확인한다.
Relay 생성·typecheck·표적 Storybook과 필요한 API/route integration 결과를 기록한다.

## Business Context

- Canonical: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0027-repost-of-quote-source-presentation.md`, `docs/design/post-action-bar.md`, `docs/design/accessibility.md`.
- Linear: [PROD-922](https://linear.app/byulmaru/issue/PROD-922), [PROD-828](https://linear.app/byulmaru/issue/PROD-828).
- User agreement: 2026-09-08 Domain·Issue·OpenSpec 승인 기록을 현재 Linear에서 확인했다. 2026-09-22 사용자가 PROD-922 Spec workflow를 요청했다. 제품 결정은 재개하지 않는다.
- Authority / Provenance: 현재 사용자 요청과 canonical·Linear가 범위를 정한다. 이 change는 수정 가능한 세션 메모이며 새로운 요구사항이나 완료 gate를 만들지 않는다.

## Session Status

- Status: Active
- Last updated: 2026-09-22
- 최신 기준: `main`의 `e7b25e151f9baf665b9bab90d725ba2ffd0f0b81`.
- Linear에 기록된 예전 change 파일은 현재 checkout·로컬 worktree·issue handoff에서 발견하지 못했다. 같은 이름으로 현재 계약에 맞춰 복원하며, 과거 artifact의 동일 digest나 재현을 주장하지 않는다.
- 구현·제품 runtime 검증: not started. 문서의 윤문·strict validation은 작성 후 별도로 기록한다.
