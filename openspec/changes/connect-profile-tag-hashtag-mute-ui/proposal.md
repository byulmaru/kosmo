## Why

[PROD-735](https://linear.app/byulmaru/issue/PROD-735)는 Profile Tag에서 같은 canonical Hashtag의 뮤트를 설정·해제하는 UI를 소유한다. 2026-09-30 범위 분리와 2026-10-02 의존성 정리에 맞춰, 서버 규칙 관리와 소비자 정책이 UI 구현 범위에 다시 섞이지 않도록 현재 계약과 검증 경계를 정리한다.

## Goal

선택한 Profile의 서버 확정 뮤트 상태를 확인하고, 해당 태그를 Profile Tag로 가진 사람에게서 오는 새 알림을 영구적으로 끄고 다시 켜는 클라이언트 흐름의 스펙을 작성한다. 작성한 스펙은 보존하며, 현재 요청에서는 검토에서 확인한 P2 세 건만 보정한다. PR #1089는 사용자 요청으로 닫힌 상태이며 구현은 별도 요청에 따라 진행한다.

## What Changes

- Profile Tag의 Hashtag identity를 유지하는 생성·해제, 현재 상태 표시와 기존 관련 Profile 탐색 보존을 정리한다.
- 요청 중·실패·재시도·성공 후 상태 수렴과 selected Profile 전환 격리의 검증 사례를 작성한다.
- PROD-1029의 서버 확정 결과를 소비하는 경계와 실제 API를 사용하는 클라이언트 종단 간 검증을 계획한다.
- 기존 뮤트 확인 UI를 재사용하는 방향으로 정리한다. 현재 UI는 영구 뮤트만 제공하며 기간 선택은 추가하지 않는다. 사용자는 범위·숨기기/접기·기간을 선택하지 않으며 게시물 해시태그 기능은 추후 구현 범위다.

## Non-Goals

- PROD-1029의 규칙 저장·서비스·API·권한·만료 정책 구현
- PROD-1030의 Post 목록·검색 적용 및 Collapse 표현, PROD-1031의 게시물 Hashtag 기준 알림 억제, PROD-1048의 행동자 Profile Tag 기준 알림 억제
- PROD-827의 Post Hashtag 연결·Hashtag Post List, PROD-926의 Quote Notification
- 뮤트 규칙 관리 전용 화면, 자동완성, 추천, Remote Profile Tag 수집, 데이터 migration 및 배포

## Constraints

- 생성·해제 대상은 TagChip이 가진 canonical Hashtag identity다. 표시 이름을 다시 해석하거나 Profile 자체를 뮤트하지 않는다.
- Owner는 현재 selected Profile이며 서버의 권한·Scope·Decision·만료 계약을 따른다. Hashtag의 공개 identity와 viewer별 뮤트 상태를 구분한다.
- PROD-1029의 완료가 UI의 선행 조건이다. 다른 소비자 이슈의 완료를 UI 완료 조건에 추가하지 않는다.
- 현재 UI는 Notification만 선택한 영구 규칙을 소비한다. 일반 Scope 지원·Local 정책 정렬은 PROD-1029가 소유하며 이 UI의 입력으로 노출하지 않는다.
- 영구 뮤트만 제공한다는 현재 사용자 결정을 canonical·디자인 문서와 Linear에 반영한다. 새 알림만 끈다는 현재 사용자 결정을 함께 반영하며 OpenSpec은 그 결정을 대신하지 않는다.

## Verification

스펙 문서는 한국어 윤문 전후 계약·구조 대조, OpenSpec strict validation, Prettier와 diff 검사를 수행한다. 제품 구현 이후에는 exact identity, 확인 취소 시 요청 없음·기존 상태 유지, 별도 새로고침·재조회·재진입 없이 성공 결과를 반영하는 현재 화면, 요청 실패·재시도, A→B 전환 중 늦은 응답 격리, 키보드·focus·접근성 및 실제 생성→조회→해제 흐름을 검증한다. 구체적인 반영 시간이나 render timing은 계약하거나 테스트하지 않는다. 현재 세션에서 제품 테스트를 실행한 것으로 표시하지 않는다.

## Business Context

- Product canonical: `docs/domain/objects/hashtag.md`, `docs/domain/objects/hashtag-mute-rule.md`, accepted `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`
- Visual design source: `docs/design/profile-tags.md`, `docs/design/hashtag-related-profiles.md`, `docs/design/profile-mute-block.md`의 기존 확인·피드백 패턴
- Linear: [PROD-735](https://linear.app/byulmaru/issue/PROD-735), [PROD-1029](https://linear.app/byulmaru/issue/PROD-1029). 2026-10-02 본문·관계를 직접 확인했으며 PROD-735 댓글은 없다.
- User agreement: 2026-10-02 PROD-735 스펙 작성 요청. 이후 사용자가 PR을 닫고 스펙을 보존하도록 지시했으며, 현재는 검토에서 확인한 P2 세 건의 문서 보정을 요청했다. 현재 UI는 영구 뮤트만 제공하도록 지시했고 기존 UI 확인을 요청했다. 이어 해당 태그를 프로필에 단 사람의 새 알림만 끄고 게시물 해시태그 기능은 추후 구현하도록 확정했다.

## Session Status

- Status: Complete
- Last updated: 2026-10-02
- 현재 제품 범위는 확인했다. PROD-1029의 실제 서버 결과를 확인한 뒤 구현하며 CLI artifact 완료 여부는 제품 구현 완료를 뜻하지 않는다.
