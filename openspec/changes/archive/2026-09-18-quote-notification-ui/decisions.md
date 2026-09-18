<!-- 세션에서 확인한 결정의 요약이다. 사용자 지시·canonical·Linear를 대신하는 승인 기록이나 ADR이 아니다. -->

## Session Context

PROD-953의 표시 계약과 독립 구현 범위를 구현 세션에 전달한다. 지속되는 표시 계약은
`docs/design/notifications.md`의 Quote 절, 범위와 검증 책임은 [PROD-953](https://linear.app/byulmaru/issue/PROD-953)에 기록한다.

## Choice Notes

### Quote의 이유 문구와 작성자 표시

- Date: 2026-09-18
- Upstream context: 현재 사용자의 “제안한 표시 구성으로 확정해” 지시와 canonical Quote 표시 계약.
- Choice: Quote 아이콘, 24px 아바타와 작성자 정보, 그 아래 `회원님의 게시글을 인용했습니다`,
  Quote 본문, 기존 Source 미리보기, 기존 Post Action Bar를 표시한다. Quote 작성자는 한 번만 표시한다.
  알림 활성화는 Quote 자체 canonical 상세로 이동한다.
- Reason: 사용자가 이 구성을 명시적으로 선택했다. 한 작성자 행과 이름 없는 이유 문구로 중복을 피하면서
  누가 썼는지와 알림을 받은 이유를 전달한다. Mastodon의 명시적인 Quote label은 비교 근거이며,
  X의 현재 공식 자료로 정확한 문구·배치를 확정하지는 않았다.
- Alternatives: 이유 문구 생략안은 선택하지 않았다. Reply의 이유 문구 제거를 Quote에 확대하지 않는다.
- Consequences: 구현 세션은 이 표시 계약을 사용한다. 기존 Source의 독립 이동, Post action,
  Read/Unread와 Profile 격리·unavailable 계약을 재사용한다.

### 서버와 독립적인 클라이언트 작업

- Date: 2026-09-18
- Upstream context: 현재 사용자 지시와 PROD-953의 의존성·검증 책임.
- Choice: 최신 main 기반 PROD-953에서 UI·Relay 경계·Storybook·클라이언트 회귀를 진행한다.
  PROD-926/PR #921은 실제 QuoteNotification API가 필요한 최종 API→UI 통합 검증의 의존성이다.
- Reason: 서버 결과가 없어도 검증할 수 있는 클라이언트 범위를 별도로 전달한다.
- Alternatives: PR #921 위에 Stack하거나 구현을 임시 cherry-pick하는 방법은 사용하지 않는다.
- Consequences: 기존 fixture/mock 경계로 가능한 검증을 수행하고 실제 API가 필요한 항목만 Deferred로
  남긴다. mock 결과를 실제 통합 완료로 표현하거나 서버 lifecycle을 중복 구현하지 않는다.

### 이번 세션의 종료 범위

- Date: 2026-09-18
- Upstream context: 현재 사용자의 명세·handoff까지만 수행하라는 지시.
- Choice: 문서와 Linear를 갱신하고 최종 시작 프롬프트를 준비한 뒤 coordination 소유권을 반환한다.
- Reason: 사용자가 별도 Implement 세션에서 구현을 시작하기로 했다.
- Alternatives: 같은 세션에서 구현을 계속하는 이전 계획은 현재 요청으로 대체됐다.
- Consequences: 이번 세션에서는 production code 수정·commit·push·PR 생성을 하지 않는다.
  구현 세션은 현재 소유권·HEAD·dirty 문서와 최신 정책을 재검증한 뒤 시작한다.

## Unresolved Questions

- 제품 표시 계약의 미결정 사항은 없다.
- delta spec이 없는 선택적 세션 하네스이므로 archive에서는 `--skip-specs`를 사용한다.
