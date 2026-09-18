## Why

Quote 알림을 받은 사람이 인용글을 확인하고 반응할 수 있도록 알림함 표시를 준비한다.
PROD-926의 서버 변경과 독립적으로 검증할 수 있는 클라이언트 작업을 먼저 진행한다.

## Goal

Quote를 구분하는 알림 UI, Quote 자체 상세 이동, 기존 읽음 처리와 Profile 격리를 제공한다.
실제 API가 필요한 최종 통합 검증은 독립적인 클라이언트 검증과 구분해 남긴다.

## What Changes

- Quote 아이콘, 24px 작성자 아바타와 작성자 정보, `회원님의 게시글을 인용했습니다` 이유 문구,
  Quote 본문, 기존 Source preview와 Action Bar를 제공한다. 작성자는 한 번만 표시하고 이유 문구는 그 아래에 둔다.
- 기존 Notification·Post 표시와 Relay fragment를 재사용해 독립적인 UI 경계를 구현한다.
- Storybook과 클라이언트 회귀에서 이동, 읽음·미확인 상태, Profile 전환과 조회 불가 결과를 확인한다.

## Non-Goals

- PROD-926의 서버 생성·조회·영구 중복 방지·권한·Read·cleanup lifecycle.
- PROD-792/924의 federation lifecycle, Quote 작성, Mention 생성, FCM.
- Word Mute·Hashtag Mute·Post Notification Mute 기반 기능과 Quote 연결.
- 공통 읽음 체계, grouping, realtime, Source 가용성 정책의 재설계.

## Constraints

- 기준은 `main`의 `8d28a08ecf7fdba8dcdfd361e37b278a5fbaffd1`이다. PROD-953은 main 위의 독립
  branch이며 PR #921 위에 쌓거나 그 구현을 임시로 가져오지 않는다.
- main에는 `QuoteNotification` concrete API가 없다. 기존 schema로 가능한 fragment와 fixture 경계를
  사용하며, 임시 서버 계약을 추가하거나 mock 결과를 실제 API 통합 증거로 표현하지 않는다.
- Quote 활성화는 Quote 자체 canonical 상세로 이동한다. Source preview의 기존 이동은 유지한다.
- read/read-all, unread indicator, selected Profile 격리와 unavailable Notification 계약을 재사용한다.
- OpenSpec은 변경 가능한 작업 메모다. 별도 승인 gate나 이슈 완료의 필수 조건으로 사용하지 않는다.
- 이번 Spec 세션은 확정 계약의 문서 반영과 handoff까지만 수행한다. 구현은 사용자가 새로 열 별도
  Implement 세션에서 시작하며, 이번 세션에서는 production code 수정·commit·push·PR 생성을 하지 않는다.

## Verification

- Relay compiler, TypeScript, 변경 파일 lint·format과 공용 Notification 회귀.
- Web Storybook: Light/Dark, 좁은 폭·긴 이름, 이유 문구와 작성자 중복, Source preview,
  Action Bar 독립 동작, Quote 상세 이동, Best Effort Read의 성공·실패와 Profile 격리.
- Deferred: 실제 QuoteNotification API → 알림함 → 상세·읽음·조회 불가 수렴.
  이 결과는 PROD-953이 소유하며 PROD-926의 실제 API가 준비되면 검증한다.
- iOS/Android runtime은 각각 실행 증거가 있어야 완료로 기록한다. Web 결과로 대체하지 않는다.

## Business Context

- Canonical: `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`,
  `docs/domain/decisions/0028-quote-notification-policy.md`, `docs/design/notifications.md`.
- Linear: [PROD-953](https://linear.app/byulmaru/issue/PROD-953),
  [PROD-926](https://linear.app/byulmaru/issue/PROD-926).
- User agreement: 2026-09-18 표시 구성 확정. 이유 문구를 포함하며 Reply의 이유 문구 제거를 Quote에
  확대하지 않는다. 구현은 별도 Implement 세션에서 진행한다.

## Session Status

- Status: Complete (available client boundary)
- Spec handoff: 표시 결정과 독립 구현을 반영했다. 실제 API 통합과 플랫폼별 runtime 증거는 Linear·PR의
  남은 제한으로 보존하며 이 세션 하네스의 task로 유지하지 않는다.
- Last updated: 2026-09-18
