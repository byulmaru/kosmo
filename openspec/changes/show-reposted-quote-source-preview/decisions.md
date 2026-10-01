## Session Context

[proposal.md](proposal.md)의 PROD-922 범위를 현재 코드에 맞춰 복원한 메모다. 이 파일은 ADR이나 새로운 승인 기록이 아니다.

## Choice Notes

### 승인된 표시 계약을 그대로 사용한다

- Decision Date: 2026-09-22
- Decision Class: Existing authority
- Status: Confirmed
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0027-repost-of-quote-source-presentation.md`, `docs/design/post-action-bar.md`, Linear PROD-922의 2026-09-08 승인 기록.
- Choice: A attribution 아래 B 표준 행과 C preview를 표시한다. C가 Quote여도 D를 펼치지 않으며 navigation·action·Reply·nullable 계약을 유지한다.
- Reason: 이미 확정한 인용 맥락 표시를 복구하는 범위다.
- Alternatives: B 본문만 유지하거나 Source를 계속 펼치는 안은 기존 승인과 맞지 않는다.
- Consequences: 이 세션은 기존 제품 선택을 다시 묻거나 새 표시 정책을 추가하지 않는다.

### 기존 preview를 Row에 조합한다

- Decision Date: 2026-09-22
- Decision Class: Suggested approach
- Status: Working note
- Authority / Provenance: `apps/app/src/components/post/PostListItem.tsx`, `apps/app/src/components/post/PostSourcePresentationView.tsx`, `apps/app/src/components/post/ReplyComposerSurface.tsx`의 현재 구현.
- Choice: `PostListRow_post`가 C preview fragment를 직접 선언하고 본문과 Action Surface 사이에 기존 preview를 표시한다.
- Reason: 표준 B 행과 기존 B action target·A Reply binding을 유지하면서 누락된 표시만 보완할 수 있다.
- Alternatives: 전체 renderer 재귀나 별도 query는 현재 결과를 내는 데 필요하지 않다.
- Consequences: 구현자는 같은 계약을 더 단순하게 만족하는 접근이 있으면 이 메모를 고칠 수 있다. generated artifact는 Relay compiler로 갱신한다.

### 현재 저장소의 세션 하네스 수명을 따른다

- Decision Date: 2026-09-22
- Decision Class: Repository workflow
- Status: Confirmed
- Authority / Provenance: `AGENTS.md`, `memory/issue-openspec-workflow.md`, `openspec/config.yaml`.
- Choice: 과거 Linear의 delta 동기화·archive 표현은 별도 제품 완료 gate로 만들지 않는다. 완료된 하네스는 가능하면 구현 PR에서 `--skip-specs`로 archive한다.
- Reason: 현재 저장소는 canonical·Linear의 실제 결과와 검증을 완료 기준으로 두고 OpenSpec을 수정 가능한 세션 메모로 사용한다.
- Alternatives: published spec의 오래된 PROD-828 pending 문장을 새 미결정이나 추가 구현 범위로 받아들이지 않는다.
- Consequences: 이 change의 사례는 현재 승인된 조합만 기록한다. 장기 spec 자동 동기화나 archive-only issue·PR은 만들지 않는다.

## Unresolved Questions

- 없음. 제품 계약을 바꾸는 새로운 결정이 생기면 canonical·Linear와 사용자 합의에서 해결한다.
