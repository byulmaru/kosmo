# PROD-903 Quote 알림 정책 검토 기록

## 상태와 범위

- 최초 검토: 2026-09-08
- 리뷰 반영: 2026-09-09
- 담당 이슈: [PROD-903](https://linear.app/byulmaru/issue/PROD-903)
- PR: [#803](https://github.com/byulmaru/kosmo/pull/803)
- 현재 결정: [ADR 0028](../decisions/0028-quote-notification-policy.md), [Notification](../objects/notification.md)

PROD-903은 Domain 정책과 canonical 문서 정렬을 소유한다. OpenSpec 작성, Notification enum·DB·API·UI
구현과 archive는 후속 [PROD-926](https://linear.app/byulmaru/issue/PROD-926)이 소유한다.
사람은 “Spec Gate 승인”으로 정책 결과와 후속 책임안을 승인했고, 2026-09-09 리뷰 반영 요청으로
조회 제한의 보존 보장을 명시적으로 완화했다. 이 기록의 과거 보존 요구는 아래 현재 결정으로 대체한다.

## 결정 이력

| 시점                         | 결정과 현재 효력                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-08 최초 질문         | Local·Remote 모두 전용 Quote 알림, direct Source Author 수신, Quote 자체 상세 이동을 선택했다. 현재 유효하다.                                                       |
| 자기 인용·조회 질문          | 같은 Profile의 자기 인용 억제와 Quote·Source 두 Post 조회 확인을 선택했다. 현재 유효하다.                                                                           |
| Mute·승인 lifecycle 질문     | Quote Author·Quote 내용/태그·direct Source 원문 thread 기준, 최초 승인 후 한 번만 생성, 재처리·재승인·소급 생성 금지를 선택했다. 현재 유효하다.                     |
| 중복 질문                    | 동시 후보의 Reply → Quote → Mention 순서, 먼저 생성된 Reply/Mention을 이후 Quote 승인으로 교체하지 않는 규칙을 선택했다. 현재 유효하다.                             |
| 조회 제한 질문               | 복구 가능한 제한의 물리 보존·복원 보장을 선택했으나 2026-09-09 명시적 변경으로 철회됐다. 현재 계약으로 적용하지 않는다.                                             |
| 2026-09-09 PR #803 리뷰 반영 | 즉시 숨김과 기존 unavailable Notification의 Best Effort 비동기 정리를 적용한다. 삭제 전 제한 해제로 다시 보일 수 있으나 저장 상태·읽음 시각·복원을 보장하지 않는다. |

## 현재 제품 결정

- Local 작성과 Remote 수신 모두 별도 Quote Notification Type을 제공한다. Recipient는 direct Repost Source
  Author Profile, Related Post는 Quote, Related Profile은 Quote Author이며 Quote 자체 상세로 이동한다.
- 같은 Profile의 자기 인용은 억제한다. 같은 Account의 서로 다른 Profile은 일반 인용으로 취급한다.
- 생성·조회에는 Quote와 direct Source 각각의 조회 권한을 적용한다. Source 비가용 시에도 Quote 자체
  Content와 조회 후보성을 유지하는 Post 정책은 바꾸지 않는다.
- Profile Mute는 Quote Author, Word/Hashtag Mute는 Quote 내용·태그만 검사한다. Post Notification Mute는
  direct Source의 원문 Root Post thread를 검사한다. 원문 내용·태그를 다시 검사하지 않는다.
- Local·Remote 모두 인용 관계가 승인돼 Source를 정상 표시할 수 있을 때 최초 생성 여부를 판단한다.
  대기·거절 중에는 Quote 알림을 생성하지 않는다. 같은 Quote의 재처리·재승인으로 새 알림을 만들지 않는다.
- 최초 Mute·조회 권한 억제 뒤 조건이 풀려도 소급하지 않는다. 기능 도입 전 Quote에도 소급하지 않는다.
  적용 대상 Remote Quote의 최초 승인은 최초 판단 시점이며, 저장된 알림의 재노출과는 구분한다.
- Quote·Mention 동시 후보는 Type별 생성·Mute 조건 적용 후 둘 다 남으면 Quote 한 건만 제공한다.
  승인 대기로 Mention이 먼저 생성됐다면 이후 승인으로 Quote를 추가하거나 Mention의 Type을 교체하지 않는다.
  이 승인 처리에서 기존 Notification·Read State·최초 읽음 시각을 변경하지 않는다.
- Reply도 후보이면 기존 Reply → Quote → Mention 순서를 적용한다. 먼저 생성된 Reply 역시 이후 Quote
  승인으로 추가·교체하지 않는다. Recipient가 다르면 각각 판단한다. Followee Post는 독립 정책을 따른다.
- Quote 또는 direct Source를 현재 조회할 수 없으면 목록·Unread count·Node·읽음 처리에서 즉시 숨긴다.
  이후 기존 unavailable Notification 정책에 따라 Best Effort로 비동기 정리할 수 있다.
- 삭제 전에 제한이 풀리고 다른 조회 조건도 충족하면 남아 있는 Notification이 다시 보일 수 있다.
  이를 위한 Notification·Read State·최초 읽음 시각의 보존이나 이후 복원은 보장하지 않는다.
- 승인 철회·Quote/direct Source 삭제 등 확정적 무효도 동일한 즉시 숨김·Best Effort 정리를 따른다.
  물리 정리 뒤에도 재처리·재승인으로 새 알림을 만들거나 삭제된 알림을 복원하지 않는다.
- Quote 전용 cleanup 보존 예외는 제거했다. Recipient 자체의 일시 비활성화·정지에 대한 공통 예외와
  Mute 추가 시 기존 알림을 변경하지 않는 공통 정책은 유지한다.

## Reply와 Quote 구조 재검증

최초 PR HEAD는 `36bec4b05220e597b98ae47d116ae7f091496bb8`이며, 리뷰 시 최신 main
`2b45d4745`에서도 다음 근거를 다시 확인했다.

- [ADR 0014](../decisions/0014-post-structure-relations.md)와 [Post](../objects/post.md)는 Content·Reply
  Parent·Repost Source를 모두 가진 Post를 Reply이면서 Quote로 정의한다.
- `packages/core/services/post-structure.ts`는 이 조합을 거부하지 않는다.
  `post-structure.test.ts`는 Parent와 Source가 같거나 다른 두 조합 모두를 허용하는 테스트를 가진다.
- `packages/core/services/create-reply-notification.ts`는 Reply Parent의 Author에게 알리며,
  Repost Source가 있다는 이유로 Reply 후보를 제외하지 않는다.
- Local `createPost` 입력에 Source가 없는 것은 작성 경로의 미구현이다.
  [PROD-431](https://linear.app/byulmaru/issue/PROD-431)은 Quote와 Reply+Quote 작성·검증을 포함한다.
- 현재 전용 Quote·Mention 알림의 생성·중복 연결은 후속 구현 대상이다. 구조 허용이나 Reply 생성 코드만으로
  이 통합 동작이 이미 구현됐다고 주장하지 않는다.

따라서 Reply+Quote 전제는 불가능한 사례가 아니며 삭제하지 않았다. Parent와 Source가 같은 Post이거나
두 Post의 Author가 같으면 같은 Recipient에게 Reply·Quote가 겹칠 수 있고, 해당 Profile을 Mention하면
세 후보가 겹친다. Author가 다르면 각각 다른 Recipient에게 판단한다.

구조 허용은 알림 순서의 이유를 증명하지 않는다. 기존 기록은 Reply → Quote → Mention의 선택 사실만
뒷받침하며 Reply와 Mention 사이에 Quote를 둔 별도 제품 이유는 확인되지 않았다. 앞서 검토했던
“구조 관계의 강도나 처리 순서와 무관한 결과”라는 설명을 당시 선택 근거로 채택하지 않는다.
동시 후보의 우선순위와 먼저 생성된 알림 유지 규칙은 구분한다.

## 리뷰 처리와 책임

| 리뷰                                | 반영                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 복구 가능한 제한의 보존 보장 완화   | Notification과 Profile Block의 Quote 전용 보존 예외를 제거하고 ADR·이 기록·PROD-903·PROD-926을 Best Effort 정리로 정렬한다.                                       |
| Reply → Quote → Mention의 근거 질문 | 실제 구조와 생성 조건을 확인해 유효한 조합을 유지한다. Quote/Mention 동시·승인 대기 시나리오를 명시하고, 기존 순서의 별도 제품 이유가 기록되지 않았음을 답변한다. |

제품 행동 규칙의 미결정 사항은 없다. Reply 우선순위의 선택 배경은 기록상 한계로 남으며 새 이유를 만들지 않는다.
승인 판정의 legacy·재승인 조건은 PROD-902/792/924 관계 계약에서 정할 의존성이다.

PROD-926의 owner는 정혜주이며 Quote 생성·영구 중복 방지·API/inbox·조회·정리, 적용 OpenSpec과
전체 통합 검증·완료/archive를 소유한다. PROD-911(Jiyu Park)의 inbound Mention 인앱 결과와 중복 처리를
연결하고 PROD-431/792/924의 작성·승인 결과를 소비한다. Local Mention 신규 기능과 FCM transport는 제외한다.
담당 구현·모든 tasks·통합 검증·delta 동기화와 validation이 완료된 뒤에만 해당 change를 archive한다.

검증에는 Mute·권한 억제, 동시 후보·Mention/Reply 선생성, 승인·재시도·재승인, 모든 조회 표면의 숨김,
삭제 전 재노출 가능성과 삭제 후 복원·재생성 금지, Recipient 공통 예외와 기존 Reply/Repost 회귀를 포함한다.
실제 runtime 검증은 PROD-926이 소유하며 PROD-903의 문서 검사나 기존 PROD-328 완료로 대체하지 않는다.
