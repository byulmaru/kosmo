## Why

Profile Tag와 Post가 공유하는 Hashtag identity는 있지만, Owner Profile이 해당 Hashtag의 뮤트 규칙을
관리할 서버 기능은 아직 없다. PROD-1029는 이 결과를 UI와 목록·알림 적용에서 분리해 전달한다.

## Goal

권한 있는 selected Profile이 같은 canonical Hashtag에 대한 규칙을 생성·변경·해제하고, 서버가 확정한
Scope·Decision·만료와 현재 적용 여부를 조회할 수 있도록 구현 범위와 검증 계획을 정리한다.

## What Changes

- Owner별 Hashtag Mute Rule의 저장, 권한 검증, 생성·변경·해제·조회를 계획한다.
- Scope 하나 이상, 미래 만료 또는 영구, 적용 중인 규칙의 유일성을 보장한다.
- 2026-09-22 확정된 Local Scope와 Local의 Collapse 소비 정책을 canonical 문서에 반영한다.
- 구현 세션에서 실행할 권한·만료·동시성·서버 응답 검증을 정리한다.

## Non-Goals

- PROD-735: Profile Tag UI, 입력 방식·기본값, 클라이언트 상태와 종단 간 검증.
- PROD-1030: Home·Local·Profile·Hashtag 목록과 실제 Post 검색의 숨김·접기 적용.
- PROD-1031: 게시물 Hashtag 기준 새 Notification 생성 억제.
- PROD-1048: 원인 행동자의 Profile Tag 기준 새 Notification 생성 억제.
- PROD-827: Post와 Hashtag 연결 및 Hashtag Post List 기반.
- 이 Spec 세션에서 애플리케이션 구현, 배포, push 또는 PR 생성.

## Constraints

- `Hashtag`의 canonical identity를 재사용한다. Profile Tag 전용 identity는 만들지 않는다.
- 생성은 `Account.Active`, `Profile.Member`와 Active/Normal Local Owner Profile 조건을 따른다.
  변경·해제·조회는 `HashtagMuteRule.Owner`와 selected Profile 격리를 따른다.
- Rule의 Owner는 Profile이다. Account의 Owner role만 허용하도록 Member 권한을 축소하지 않는다.
- Scope는 Home·Local·Profile·Hashtag·Search·Notification이다. 저장한 Collapse를 Local 때문에 Exclude로
  바꾸지 않는다. Local 목록에서의 소비는 PROD-1030이 소유한다.
- 만료된 규칙은 적용 중인 뮤트로 판정하지 않는다. UI 기본값은 이 명세로 확정하지 않는다.
- OpenSpec은 가변 작업 메모다. 제품 권위와 완료 기준은 canonical·Linear가 소유한다.

## Verification

실제 GraphQL 요청과 DB 결과로 권한·identity·입력 검증·중복 생성·만료 후 재생성·변경·해제·Profile 격리를
확인한다. Worker 경로는 commit과 retry를 실행해 확인한다. 현재 Implement 세션은 구현과 검증 코드를 작성하고, 실행 검증은 GitHub CI의 API/Core/Worker job에 인계한다.

## Business Context

- Product canonical: `docs/domain/objects/hashtag.md`, `docs/domain/objects/hashtag-mute-rule.md`,
  `docs/domain/policies/post-list.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`.
- Visual design source: 없음. 이번 범위에는 UI presentation 변경이 없다.
- Linear: [PROD-1029](https://linear.app/byulmaru/issue/PROD-1029),
  [PROD-735](https://linear.app/byulmaru/issue/PROD-735)의 2026-09-30 분리 범위와 PROD-1029의 2026-10-02 소비자 범위 보완.
- User agreement: PROD-1029의 Spec 승인과 현재 `kosmo-implement-workflow` 실행 요청.

## Session Status

- Status: Active
- Last updated: 2026-10-02
- 조사 기준: `main` / `c2c967d672751cecc416631858288dedad3cf341`.
- 브랜치: `PROD-1029`, `gh stack init --base main PROD-1029`로 생성한 1-layer Stack.
- 규칙 관리 구현·실행 검증 코드를 작성했다. 런타임 검증과 원격 전달은 pending이다.
