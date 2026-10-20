## Session Context

`proposal.md`의 PROD-1175 작업 메모다. 새 ADR이나 승인 기록을 만들지 않는다.

## Choice Notes

### 같은 행의 드래그 영역만 확장

- Date: 2026-10-20
- Authority / Provenance: [PROD-1175](https://linear.app/byulmaru/issue/PROD-1175), `docs/design/reactions.md`, `docs/design/accessibility.md`.
- Decision Date: 2026-10-20
- Decision Class: settled_scope
- Status: settled_upstream
- Choice: iOS·Android에서 중앙·좌우 드래그의 결과를 동일하게 하고 보이는 바와 기존 전이를 유지한다.
- Reason: 좁은 바를 정확히 잡아야 하는 불편을 해결한다.
- Alternatives: 바 자체 확대와 시트 전체 gesture capture는 이슈의 범위에 맞지 않는다.
- Consequences: 모바일 Web과 스크롤바는 별도 이슈로 남긴다. 기존 responder 경계는 실제 동작을 확인한 뒤 필요한 부분만 고친다.

## Unresolved Questions

- 미정인 제품 결정은 없다. 원인·제보 환경의 미확인 사실은 `design.md`에 남긴다.
