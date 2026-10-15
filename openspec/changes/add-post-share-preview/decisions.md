## Session Context

[proposal.md](./proposal.md)의 PROD-1107 구현 계획을 위한 작업 메모다. 제품 계약의 근거는 현재
canonical·Linear와 명시적인 사용자 선택이다.

## Choice Notes

### 현재 guest 조회 정책의 적용 범위

- Date: 2026-10-12
- Upstream context: 같은 날짜의 사용자 답변, Linear PROD-1107의 확정 범위,
  `docs/domain/objects/post.md#post-외부-공유-미리보기`.
- Choice: 현재 guest 조회 정책을 적용하고 Instance Domain Block 모델과 공통 조회 정책 도입은 별도 범위로 둔다.
- Reason: 이번 결과는 기존 Post 공유 URL의 콘텐츠 미리보기다. moderation 모델 전체 도입은 별도의 완료 범위로 둔다.
- Alternatives: Domain Block 모델·공통 정책과 관련 migration을 같은 이슈에서 구현하는 안은 선택하지 않았다.
- Consequences: 기존 guest 제한은 유지한다. Domain Block 정책의 구현·검증 완료를 주장하지 않으며 후속
  moderation 작업에서 공유 미리보기에도 공통 정책을 적용한다. ADR 0017의 검색 예외를 자동 확장하지 않는다.

### OpenSpec으로 구현 계획 전달

- Date: 2026-10-12
- Upstream context: 사용자가 새 기능에 대한 OpenSpec 작성을 명시적으로 요청했다.
- Choice: `add-post-share-preview`에 proposal·design·decisions·tasks와 `post-share-preview` delta spec을 작성한다.
- Reason: 표시·공개 경계·HTTP·실제 외부 소비 검증을 다음 구현 세션에서 함께 확인하도록 한다.
- Alternatives: 최초 handoff-only 계획은 현재 요청으로 대체한다.
- Consequences: 로컬 handoff는 change 경로와 상태를 요약한다. 같은 세션에서는 제품 코드를 구현하지 않는다.

## Unresolved Questions

- 없음. 실제 카드 검증에 사용할 공개 Post·테스트 공간과 접근 가능 여부는 실행 준비 사항이며, 이번 제품
  계약이나 범위를 다시 결정하는 질문은 아니다. 승인된 테스트 대상이 확보되기 전에는 외부 메시지를 보내지 않는다.
