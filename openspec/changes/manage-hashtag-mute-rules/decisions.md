## Session Context

`proposal.md`의 PROD-1029 범위를 구현 세션에 전달하기 위한 메모다. 이 파일은 ADR이나 승인 기록이 아니며,
구현 선택은 관찰 가능한 계약을 유지하는 범위에서 바꿀 수 있다.

## Choice Notes

### 서버 규칙 관리와 소비자 범위

- Date: 2026-09-30
- Authority / Provenance: PROD-1029와 PROD-735의 현재 본문 및 관계.
- Decision Date: 2026-09-30
- Decision Class: Existing upstream scope
- Status: Confirmed upstream
- Upstream context: canonical Hashtag identity, Rule 소유권과 입력 조건.
- Choice: 서버 규칙 생성·변경·해제·조회와 적용 여부만 이번 구현 범위에 둔다.
- Reason: 서버 규칙 관리는 Profile Tag UI, 목록·검색 적용, Notification 생성 억제와 독립적으로 검증할 수 있다.
- Alternatives: 이전 PROD-735의 통합 범위를 이어받는 방식은 현재 이슈 분리와 맞지 않는다.
- Consequences: PROD-735·PROD-1030·PROD-1031과 2026-10-02에 추가된 소비자 PROD-1048이 후속 결과를
  소유하며 그 완료를 이 이슈의 완료로 표시하지 않는다. 규칙 관리는 PROD-827의 게시물 Hashtag 연결을 기다리지 않는다.

### Local Scope의 문서 정렬

- Date: 2026-09-30
- Authority / Provenance: PROD-1029가 명시한 2026-09-22 확정 결정.
- Decision Date: 2026-09-22
- Decision Class: Existing upstream decision alignment
- Status: Confirmed upstream
- Upstream context: `docs/domain/objects/hashtag-mute-rule.md`, `docs/domain/policies/post-list.md`.
- Choice: Local을 Scope에 추가하고 Local 목록에서 Collapse도 Exclude로 소비한다고 기록한다.
- Reason: 현재 문서에는 Local Scope와 소비 예외가 빠져 있었다.
- Alternatives: 저장 Decision을 Exclude로 변경하면 다른 Scope의 의미가 바뀌므로 채택하지 않는다.
- Consequences: 이번 이슈는 Local 입력의 저장·조회를 맡고 목록의 실제 소비는 PROD-1030이 담당한다.

### 기존 identity와 최소 실행 경계

- Date: 2026-09-30
- Authority / Provenance: Hashtag 객체, ADR 0020, `docs/architecture/core-services.md`, 현재 코드 조사.
- Decision Date: 2026-09-30
- Decision Class: Suggested implementation approach
- Status: Working note
- Upstream context: Hashtag Node와 shared DB, 요청의 selected Profile, Worker Activity 실행 경계.
- Choice: Hashtag global ID를 재사용하고 DB 유일성·만료 조건과 Owner 제한을 결합한다. 새 mutation의
  transaction과 retry는 Worker Activity에서 처리하는 접근을 권장한다.
- Reason: 문자열 identity 중복과 Profile별 상태 누출을 피하면서 서버 확정 결과를 반환할 수 있다.
- Alternatives: 기존 Profile Mute의 영구 뮤트 코드를 그대로 복제하지 않는다. 구체 row 갱신 방식과 API 이름은
  구현 중 현재 계약과 실제 retry 결과에 맞게 조정할 수 있다.
- Consequences: DB·API·Worker의 실행 검증이 필요하다. 이 메모만으로 새 retention·rollout 보장을 만들지 않는다.

## Unresolved Questions

- PROD-735의 UI 입력 방식·기본값은 미결정이다. 이번 범위의 blocker나 서버 기본값으로 옮기지 않는다.
- PROD-1029의 제품 결정은 현재 근거에서 추가로 발견하지 못했다. 실제 구현은 최신 authority를 재검증한다.
