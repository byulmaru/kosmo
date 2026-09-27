# PROD-924 현재 구현 방향

제품 요구사항은 `docs/domain/decisions/0029-quote-consent-and-federation.md`, `docs/domain/objects/post.md`, Linear PROD-924를 따른다. 이 문서는 변경 가능한 세션 메모이며 추가 계약을 만들지 않는다.

- Post가 작성 정책과 자신의 인용 동의를 소유한다. 요청·승인 URI의 유일성과 Source/Quote/작성자 결속을 유지한다.
- 원격 Quote는 먼저 검증·저장한다. 동의의 Source 결속과 UI의 `repostSourceId`를 분리해 기존 원격 수신 노출 범위를 바꾸지 않는다.
- Local Post 작성·삭제와 인용 승인 명령은 Update-with-Start로 접수한다. 상태 전이는 Activity transaction에서 수행하고, commit 결과 반환 뒤 Workflow가 생성한 후속 효과의 재시도를 담당한다.
- 원본 서명이 필요한 철회 forwarding은 Fedify의 원본 Activity를 유지한다. 재직렬화한 객체를 원본 서명 메시지로 취급하지 않는다.
- 게시 후 정책 변경과 그 전용 API·UI·Workflow는 제외한다. 정책은 작성 시 선택하고 최초 Note에 반영한다.
- 새 구조는 미배포이므로 PR 전용 마이그레이션을 직접 수정한다. 기존 Local Quote 백필은 하지 않는다.

진행과 현재 검증 상태는 `tasks.md`, 실제 원격 head·CI·리뷰 대응 증거는 PR 및 portable handoff에 기록한다.
