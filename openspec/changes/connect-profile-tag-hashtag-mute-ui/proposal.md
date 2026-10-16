## Why

PROD-735의 기존 “태그 맥락” 표현은 뮤트 진입점을 명확히 하지 않았다. 2026-10-04 사용자는
프로필 태그 상세 페이지에서 뮤트하도록 확정하고 Linear·ADR·spec 반영을 요청했다.

## Goal

공개 Profile의 TagChip → 기존 태그 상세·관련 Profile 목록 → 태그 뮤트·해제 흐름으로 정렬한다.
2026-10-04 사용자가 헤더 우측 종 아이콘 목업을 승인해 제품 구현과 검증을 진행한다. 후속 리뷰 요청에 따라 문서·스펙 정합성과 현재 HEAD의 CI를 확인해 #1095에 반영한다.

## What Changes

- 프로필 화면의 태그 뮤트 벨·메뉴를 채택하지 않고 기존 TagChip 탐색 링크를 유지한다.
- 기존 태그 상세 페이지에서 exact canonical Hashtag와 selected Profile의 서버 확정 상태를 사용한다.
- 기존 확인·요청 중·취소·오류·재시도·완료 피드백을 재사용하고 전체 진입 흐름의 재검증을 계획한다.

## Non-Goals

- 별도 태그 상세 페이지, 알림 설정 화면, 범위·방식·기간 선택 UI 추가
- 기존 Profile 자체의 뮤트 제거 또는 재설계
- PROD-1029 서버 규칙, PROD-1030 목록·검색, PROD-1048·PROD-1031 알림 억제 구현
- 데이터 migration, 배포, merge

## Constraints

- 현재 효과는 해당 태그를 프로필에 단 사람의 새 알림에 대한 영구 뮤트다.
- 다른 Scope·임시 규칙 보존, 권한, actor·target 격리와 기존 목록 조회 계약을 유지한다.
- canonical·Linear와 현재 사용자 지시가 제품 계약을 소유하며 OpenSpec은 구현 인계 메모다.

## Verification

문서는 OpenSpec strict validation, Prettier, diff 검사로 검증한다. 후속 구현에서는 실제 API를 사용하는
TagChip 탐색 → 태그 상세의 뮤트 → 상태 반영 → 해제 흐름과 취소·실패·재시도·actor 전환을 검증한다.
Storybook을 실행해 실제 상세 페이지 상태를 캡처한다. 기존 프로필 화면 UI의 CI·캡처는 새 흐름의 완료 근거가 아니다.

## Business Context

- [PROD-735](https://linear.app/byulmaru/issue/PROD-735)
- `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`의 2026-10-04 추가 결정
- `docs/domain/objects/hashtag-mute-rule.md`
- `docs/design/profile-tags.md`, `docs/design/hashtag-related-profiles.md`, `docs/design/profile-mute-block.md`

## Session Status

- Last updated: 2026-10-04
- 헤더 종 아이콘의 로컬 구현을 반영했다. 현재 검증 결과와 남은 범위는 tasks.md에 기록한다.
