<!-- Current session reasoning only; not an approval ledger or ADR. -->

## Session Context

PROD-1234의 확정된 범위와 구현자가 조정할 수 있는 제안을 구분한다. canonical·Linear와 현재 사용자 합의가 권위를 가진다.

## Choice Notes

### 각 고정글 메뉴에서 즉시 이동

- Decision Date: 2026-10-27
- Decision Class: Current User Agreement
- Status: Settled
- Authority / Provenance: 현재 대화의 첫 번째 질문에 대한 사용자 선택, PROD-1234, `docs/design/post-action-bar.md`.
- Choice: 각 고정글의 더보기 메뉴에서 `위로 이동` 또는 `아래로 이동`을 선택하면 즉시 저장한다.
- Reason: 사용자가 이 방식을 선택했다. 기존 고정 메뉴에 순서 변경도 함께 둔다.
- Alternatives: 별도 화면의 드래그 후 저장, 별도 화면의 위·아래 버튼 후 저장.
- Consequences: 드래그 편집 화면과 별도 저장·취소 단계는 이번 범위에 넣지 않는다.

### 기존 관리 권한 유지

- Decision Date: 2026-10-27
- Decision Class: Current User Agreement
- Status: Settled
- Authority / Provenance: 현재 대화의 두 번째 질문에 대한 사용자 선택, PROD-1234, `docs/domain/objects/profile.md`.
- Choice: 기존 고정·해제처럼 `Profile.Member`를 사용해 Owner와 Member 모두 순서를 바꿀 수 있다.
- Reason: 사용자가 기존 관리 권한을 유지하는 방식을 선택했다.
- Alternatives: 순서 변경만 Owner에게 허용.
- Consequences: 기존 Active Account·selected Profile·Local Active/Normal 및 Post 자격을 유지한다. Remote Profile을 Local에서 재정렬하지 않는다.

### Local과 Remote의 binary 정렬 키 통일

- Decision Date: 2026-10-27
- Decision Class: Current User Agreement
- Status: Settled
- Authority / Provenance: 현재 사용자의 `Local과 Remote 모두 binary 키로 통일하는 방향으로 스펙에 반영해줘` 요청. 현재 구현 근거는 `packages/core/db/tables.ts`와 `packages/fedify/src/remote-featured-snapshot.ts`이며 전환 정책은 `memory/database/migrations/workflow.md`다.
- Choice: Local과 Remote의 고정 순서 저장을 공통 `bytea` 기반 binary fractional ordering key로 통일한다. Remote 정수 `position`을 최종 정렬 방식으로 유지하던 제안을 대체한다.
- Reason: 사용자가 양쪽의 저장 표현을 통일하도록 선택했다. Remote의 정수는 KOSMO가 수신 목록에 부여한 내부 표현이며 전송 규격의 제약이 아니다.
- Alternatives: Local만 binary로 전환하고 Remote 정수 유지, 양쪽 정수 사용, bytewise collation의 문자열 fractional key. 이번 방향으로 채택하지 않는다.
- Consequences: 전환 시 Local·Remote의 기존 membership와 상대 순서를 보존한다. Remote의 수신 순서·전체 snapshot 교체·Local 재정렬 거부를 유지한다. 라이브러리·컬럼명·전환 방법은 구현 검증으로 정하며, schema·초기화·동시 충돌·key 길이·cursor·구버전 호환과 rollback을 검증한다. legacy 정수 제거는 기존 contract gate를 따르고 production 실행은 승인하지 않는다. 구현 세부를 canonical·Linear의 제품 계약으로 추가하지 않는다.

## Unresolved Questions

- 없음.
