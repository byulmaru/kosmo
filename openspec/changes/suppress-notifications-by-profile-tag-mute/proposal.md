## Why

현재 제공되는 Profile Tag만으로도 뮤트한 주제의 태그를 단 사람이 보낸 새 알림을 막을 수 있어야 한다.
게시물 Hashtag 도입을 기다리지 않고 PROD-1048의 서버 억제 범위를 준비한다.

## Goal

새 Notification 생성 판단 시점에 원인 행동자에게 저장된 Profile Tag와 Recipient Profile의 적용 중인
Notification Scope Hashtag Mute Rule이 일치하면 알림을 생성하지 않는 계약과 검증 계획을 작성한다.
이번 PR의 전달물은 스펙과 canonical 정렬이며, 구현은 후속 세션에서 진행한다.

## What Changes

- PROD-1048에 기록된 2026-10-02 사용자 결정을 canonical 문서에 반영한다.
- canonical Hashtag identity 일치, Recipient 격리, 생성 시점 판정과 기존 알림 보존을 정리한다.
- 현재 구현된 Follow·Follow Request·Reaction·Reply·Repost·Quote의 생성 경로와 Quote 비소급 판정을 연결한다.
- 구현·실패 경로 검증과 PROD-1029 선행 결과의 인수 조건을 남긴다.

## Non-Goals

- 규칙 관리·권한·만료 판정의 기반 구현(PROD-1029), 설정·Profile Tag UI(PROD-735).
- Post Hashtag 연결·Hashtag Post List(PROD-827), 게시물 태그 알림 억제(PROD-1031), 목록·검색 필터링.
- Mention·Followee Post·Remote Quote 등 미완성 기반 생성 기능, Word Mute·Post Notification Mute 기반의 신규 구현.
- Operational 알림, 기존 Notification 제거·Read State 변경, 운영 설정 변경·배포.

## Constraints

- Related Profile의 구조화된 Profile Tag만 검사한다. bio·Post Content에서 태그를 추정하지 않는다.
- Recipient가 Owner인 적용 중인 Notification Scope Rule만 소비하고 Exclude·Collapse 모두 생성을 억제한다.
- Profile Tag 기준과 게시물 Hashtag 기준은 각각 독립적인 억제 사유다. PROD-827·PROD-1031·PROD-735 완료를 기다리지 않는다.
- Quote에서는 Quote Author를 검사한다. Source Author로 대체하지 않으며 최초 판단·중복·비소급 계약을 유지한다.
- 현재 생성 권한·조회 자격·Profile Mute·Block과 원인 행동의 성공·재시도 경계를 유지한다.
- 선행 구현은 PROD-1029만 필요하다. 이 세션 하네스는 새로운 제품 요구사항이나 영구 구현 결정을 만들지 않는다.

## Verification

스펙 PR은 OpenSpec strict validation, 문서 형식, 근거·범위와 윤문 전후 계약 보존을 확인한다.
후속 구현은 실제 생성 서비스를 호출해 유형별 생성 여부, Recipient 격리, 실패·재시도, Quote 최초 판단과
기존 Notification·Read State 보존을 검증한다. 세부 입력과 관찰 결과는 specs 및 tasks에 기록한다.

## Business Context

- Product canonical: `docs/domain/objects/hashtag-mute-rule.md`, `docs/domain/objects/notification.md`,
  `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`,
  `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`,
  `docs/domain/decisions/0028-quote-notification-policy.md`.
- Visual design source: 없음. 서버 생성 억제만 다룬다.
- Linear: [PROD-1048](https://linear.app/byulmaru/issue/PROD-1048),
  [PROD-1029](https://linear.app/byulmaru/issue/PROD-1029), [PROD-1031](https://linear.app/byulmaru/issue/PROD-1031).
- User agreement: 현재 대화의 PROD-1048 스펙 작성·Stack PR 요청. 제품 결정 근거는 PROD-1048 본문의
  2026-10-02 사용자 결정이며, 완성된 스펙의 승인이나 구현 승인을 대신하지 않는다.

## Session Status

- Status: Active
- Last updated: 2026-10-02
- 구현·런타임 검증: 미실행. 이 문서는 후속 구현의 작업 메모다.
