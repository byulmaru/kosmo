## Session Context

[proposal.md](./proposal.md)의 PROD-1152 계획을 이해하기 위한 세션 메모다. 제품 계약은
`docs/domain/objects/post.md`, `docs/design/post-action-bar.md`와 Linear PROD-1152에 기록한다.

## Choice Notes

### 사용자 선택을 canonical과 Linear에 반영

- Date: 2026-10-19
- Upstream context: 현재 대화에서 사용자가 네 질문에 각각 답한 선택, Linear PROD-1152와 Post canonical.
- Choice: 현재 viewer가 조회 가능한 직접 Reply만 집계하고 0은 숨긴다. 공용 전체 화면에 적용하며 본인 작성·삭제는
  서버 확정 뒤, 다른 사용자·원격 변경은 재조회 시 반영한다.
- Reason: 사용자가 답글의 존재와 규모를 확인할 수 있고 비공개 Reply의 존재를 숫자로 노출하지 않는다.
- Alternatives: 전체 하위 Reply, viewer와 무관한 전체 수, 0 표시, 실시간 갱신은 선택하지 않았다.
- Consequences: 집계·화면·갱신의 검증을 한 이슈 안에서 조정하며, 기존 전체 하위 Reply 조회는 유지한다.

### 기존 관계의 batch 집계를 우선 검토

- Date: 2026-10-19
- Upstream context: `design.md`의 현행 코드 조사와 이번 세션의 구현 제안. 영구 구현 결정이 아니다.
- Choice: 기존 Parent index를 활용한 요청 단위 집계와 mutation 응답의 Parent 수치 정규화를 우선안으로 둔다.
- Reason: 직접 Reply와 viewer별 조회 조건을 표현할 수 있고 별도의 영속 상태를 먼저 만들 필요가 없다.
- Alternatives: 영속 counter, 페이지 길이 집계, 전역 refetch.
- Consequences: 구현자는 DB 실행 결과와 query plan을 확인해 접근을 조정한다. 이 메모만으로 새 counter나 migration을 요구하지 않는다.

## Unresolved Questions

- 없음. 이번 세션의 제품 선택은 현재 사용자 합의에서 확정했으며 기술 제안은 구현 중 조정할 수 있다.
