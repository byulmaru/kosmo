## Why

타임라인과 타래의 Action Bar에서 아이콘 사이, 버튼 slot의 빈 부분과 위쪽 내부 여백을 눌러도 게시글 상세로 이동하지 않는다. PROD-1168은 이 여백에서 상세로 진입할 수 있게 하되 개별 버튼의 입력은 그대로 유지하도록 정했다.

## Goal

대상 행의 Action Bar에서 실제 버튼 입력 영역을 제외한 여백을 클릭·탭하면 그 행의 상세 대상으로 한 번 이동하도록 구현할 범위와 검증 방법을 정리한다. 이번 Spec 세션의 산출물은 이 작업 메모와 로컬 handoff다.

## What Changes

- 일반 Post·Quote는 자신의 상세로, 순수 Repost는 direct Source 상세로 연결한다. 타래의 조상·현재·하위 행을 각각 확인한다.
- 답글·재게시·반응·북마크·더 보기와 숫자·버튼 내부 입력은 기존 액션만 실행한다. disabled/pending 버튼 입력도 배경 이동으로 바꾸지 않는다.
- 새 여백 이동 영역에 Web pointer 커서를 제공하고 드래그·영역 밖 release·스크롤을 탭으로 처리하지 않는다.
- 구현 PR에서 관련 디자인 문서에 새 상호작용을 반영하고 공용 Native 입력의 회귀를 확인한다.

## Non-Goals

- Reaction Summary의 좁은 칩 간격과 마지막 칩 뒤 여백: PROD-1165의 기존 경계를 유지한다.
- 작성자 위쪽·핸들 오른쪽 여백과 기존 링크의 전수 cursor 점검: PROD-1176·PROD-1167의 범위다.
- 액션 mutation·권한·집계·조회 정책, 전체 카드 링크화, 신규 미디어 뷰어 전용 동작, 별도 롤아웃 정책.
- 이 세션에서 제품 코드·테스트 코드 작성, 앱 테스트 실행 또는 원격 PR 변경.

## Constraints

- 행의 상세 대상과 개별 액션의 대상은 따로 유지한다. 순수 Repost의 Reply는 바깥 Post 기준 disabled이고 나머지 소셜 액션은 direct Source를 대상으로 한다.
- Action Bar는 본문·Source navigation의 sibling으로 둔다. toolbar 전체를 Link/Pressable로 감싸지 않는다.
- 기존 버튼의 실제 입력 영역과 플랫폼별 크기·배치, 메뉴·포커스·닫힘, CW·미디어·본문 링크의 독립 동작을 유지한다.
- 현재 출시 범위는 Web이다. 공용 UI 변경의 Native 입력·스크롤 회귀와 Native 출시 전 실기기·보조 기술 검증은 증거를 나눠 기록한다.
- 이 문서는 비권위 세션 메모다. 요구사항은 현재 사용자 지시, canonical 문서와 Linear에서 다시 확인한다.

## Verification

실제 버튼 경계를 측정해 버튼 사이·slot 빈 부분·상단 내부 여백 좌표를 선택한다. 일반 Post·Quote·순수 Repost와 타래의 조상·현재·하위 행에서 목적지와 단일 이동을 확인한다. 각 버튼·숫자·disabled/pending 입력, 메뉴, 드래그·영역 밖 release·스크롤 취소도 함께 확인한다. 화면·플랫폼·입력 방식·빌드 head와 미확인 항목을 남긴다.

## Business Context

- Product canonical: `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/policies/post-list.md`. 기존 관계·집계·조회 정책은 유지한다.
- Visual design source: `docs/design/post-action-bar.md`, `docs/design/post-thread.md`, `docs/design/accessibility.md`. 표시·입력·접근성 경계에만 적용한다.
- Linear: [PROD-1168](https://linear.app/byulmaru/issue/PROD-1168), 2026-10-20 본문 갱신. 2026-10-22 조회에서 댓글 없음.
- User agreement: 현재 사용자의 `kosmo-spec-workflow PROD-1168` 요청. Linear의 확정 범위를 기획하며 새 제품 결정을 추가하지 않는다.
- Inspection baseline: main `bfa5a9781cf94570eb9f2c76c21a4804d4bfb4ae`. 배포·브라우저·Native runtime은 이번 세션에서 재현하지 않았다.

## Session Status

- Status: Active
- Last updated: 2026-10-22
- Progress: Linear·저장소·코드 조사 완료. 구현과 동작 검증은 다음 phase에 남긴다.
