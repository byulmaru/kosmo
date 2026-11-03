## Why

프로필에 고정한 대표 게시글을 사용자가 원하는 순서로 보여줄 수 없다. PROD-1234는 기존 고정 관계를 유지하면서 순서를 직접 바꾸는 기능을 제공한다.

## Goal

Local Profile에서 이미 고정한 게시글을 위아래로 이동하고 저장한다. 방문자가 나중에 프로필을 다시 조회해도 저장된 순서를 확인할 수 있다.

## What Changes

- 각 고정글의 더보기 메뉴에 `위로 이동`과 `아래로 이동`을 제공하고 선택하면 즉시 저장한다.
- 순서 변경은 고정 관계를 추가하거나 해제하지 않는다.
- Local 조회와 outbound Featured collection이 같은 저장 순서를 사용한다.
- Local과 Remote 고정 순서의 저장 표현을 `bytea` 기반 binary fractional ordering key로 통일한다. 기존 고정 관계와 상대 순서를 전환 후에도 보존한다.

## Non-Goals

- 드래그나 별도 순서 편집 화면, 저장·취소 단계, 새 고정 개수 제한.
- Home·Local·Hashtag와 Profile chronology 순서 변경.
- 기존 pin/unpin 흐름이나 Remote Featured 수신·표시 정책 변경.

## Constraints

- 기존 Account·Profile·Post 자격과 조회 권한을 유지한다.
- Remote Profile은 원격에서 받은 순서를 유지한다.
- 현재 사용자 결정에 따라 순서 변경은 기존 고정·해제와 같은 `Profile.Member` 권한으로 Owner와 Member 모두에게 허용한다.
- 이 change는 현재 작업의 메모이며 제품 계약의 권위는 canonical·Linear와 현재 사용자 합의에 있다.

## Verification

- 저장 전후 고정 membership가 같고, 재조회한 순서가 요청 결과와 일치하는지 실행으로 검증한다.
- 권한·visibility·lifecycle, 기존 pin/unpin, Remote 순서와 chronology pagination을 회귀 검증한다.
- Local Featured의 여러 페이지와 권한별 필터링이 저장 순서를 따르는지 확인한다.
- 실제 메뉴 입력, pending·실패·재시도와 focus 복귀를 검증한다. Native runtime 관찰과 자동화 증거는 구분한다.

## Business Context

- Product canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`.
- Visual design source: `docs/design/post-action-bar.md`, `docs/design/accessibility.md`. 시각 구조·상태 표현·접근성·상호작용 presentation에 적용한다.
- Linear: [PROD-1234](https://linear.app/byulmaru/issue/PROD-1234). PROD-809·PROD-975·PROD-1164의 기존 계약을 유지한다.
- User agreement: 2026-10-27 현재 대화에서 `각 고정글 메뉴의 ‘위로/아래로 이동’, 즉시 저장`과 `기존 고정·해제처럼 Owner와 Member 모두 허용`을 선택했다.
- Implementation direction: 같은 날 사용자가 `Local과 Remote 모두 binary 키로 통일하는 방향`을 스펙에 반영하도록 요청했다. Remote의 원격 순서 보존과 Local에서의 재정렬 금지는 유지한다.

## Session Status

- Status: Active
- Last updated: 2026-10-27
