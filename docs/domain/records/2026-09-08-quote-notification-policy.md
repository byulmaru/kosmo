# PROD-903 Quote 알림 정책 검토 기록

## 상태와 범위

- 작성일: 2026-09-08
- 상태: 정책 결과와 후속 책임안 승인 완료. 과거 질문·제안 기록은 당시 상태이며 최종 승인은 마지막 승인 기록을 따른다.
- 담당 이슈: [PROD-903 — Quote 알림의 생성·수신·정리 정책을 결정한다](https://linear.app/byulmaru/issue/PROD-903)
- 확인한 기준: `main`의 `4417b2a8a1a11796ae41adc9921686e1a3e4fe25`, 같은 날짜에 조회한 Linear 본문·관계·댓글.

PROD-903은 알림 제공 여부와 정책을 결정하고 canonical 문서와 후속 이슈에 반영한다. 이 이슈는
OpenSpec 작성, Notification enum·DB·API·UI 구현, Push 전달과 전체 알림 grouping 재설계를 제외한다.
이 기록도 구현 명세가 아니다. 결정이 확정되면 해당 내용을 canonical 문서에 반영하고, 사람이 Domain Gate를
승인한 뒤 후속 구현 이슈의 범위와 검증 책임을 확정한다.

## 조사 당시 확인한 근거

- [Notification](../objects/notification.md)은 Quote 유형을 정의하지 않는다. Repost 알림의 원인은 Content와
  Reply Parent가 없는 순수 Repost로 한정된다. Quote 알림을 기존 Repost 알림으로 간주할 수 없다.
- [Post](../objects/post.md)와 [ADR 0014](../decisions/0014-post-structure-relations.md)는 Quote를 Content와
  direct Repost Source의 조합으로 정의한다. Reply Parent도 함께 가질 수 있다. Source가 삭제되거나 조회
  불가가 되어도 Quote 자체의 Content와 조회 후보성은 유지되며 Source 관계만 숨긴다.
- [ADR 0015](../decisions/0015-post-share-reference.md)에 따라 Content가 있는 Quote는 자신의 상세 경로를
  가진다. Quote 안의 Source를 선택할 때만 Source 상세로 이동한다.
- [Notification](../objects/notification.md)의 공통 정책은 새 알림에 조회 권한과 Mute·Block을 적용한다.
  나중에 추가된 Mute는 기존 알림과 Read State를 바꾸지 않는다. 조회 불가 알림은 목록, Unread count,
  Node 조회와 읽음 처리에서 숨기고 비동기로 정리한다. Recipient 자체의 복구 가능한 비활성화·정지만으로는
  알림을 물리적으로 제거하지 않는다.
- [Post Notification Mute](../objects/post-notification-mute.md)는 Root Post와 Reply 하위에서 발생한
  Reply·Reaction·Repost 알림을 억제한다. Quote에 적용할 대상 thread는 아직 정의하지 않았다.
- [Word Mute Rule](../objects/word-mute-rule.md)과 [Hashtag Mute Rule](../objects/hashtag-mute-rule.md)은
  Notification Scope가 일치하는 새 알림을 억제한다. Quote와 Source 중 어느 내용을 검사할지는 별도로 정해야 한다.

## 이슈와 현재 구현의 경계

| 이슈                                                   | 현재 소유하는 결과                                                                       | Quote 알림과의 경계                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [PROD-431](https://linear.app/byulmaru/issue/PROD-431) | 로컬 Quote 작성의 API·core·client, 담당 테스트와 통합 검증, 적용 OpenSpec의 완료·archive | Quote 알림 정책은 범위에 없으며 Domain Gate에서 먼저 결정하도록 명시한다.                                  |
| [PROD-792](https://linear.app/byulmaru/issue/PROD-792) | 원격 Quote 형식·승인 검증, materialization, 승인 상태에 따른 Source 표시                 | 알림 생성·철회 정책을 소유하지 않는다. legacy 승인 조건과 철회 후 재승인 전이는 본문만으로 확정할 수 없다. |
| [PROD-412](https://linear.app/byulmaru/issue/PROD-412) | 순수 Repost 알림의 생성과 inbox 표시, 완료된 구현                                        | 기존 Repost 알림은 Quote 전용 알림의 근거가 아니다.                                                        |
| [PROD-328](https://linear.app/byulmaru/issue/PROD-328) | unavailable 알림의 bounded batch·Schedule 정리와 검증                                    | 새 Quote 유형의 지원 여부와 철회 조건은 별도 연동·검증이 필요하다.                                         |

조회한 PROD-903·431·328·412에는 댓글이 없었다. PROD-792의 댓글 1개는 계약을 변경하는 내용이 아니었다.
PROD-903과 다른 네 이슈는 현재 관련 이슈로 연결돼 있다. 이 관계만으로 Quote 알림 구현의 선후 의존성이 확정되지는 않는다.

현재 Notification DB·GraphQL·앱은 Follow, Follow Request, Reaction, Reply, Repost를 지원한다.
조사 범위에서는 전용 Quote·Mention 알림 구현을 확인하지 못했다. Reply 알림 생성 함수가 있다는 사실만으로
아직 구현되지 않은 Reply+Quote 작성 경로의 알림 결과를 확정하지 않는다.

`packages/core/services/notification.ts`의 Repost 생성 조건은 Content와 Reply Parent가 없는 Post만
허용한다. `packages/core/visibility/notification.ts`와
`apps/worker/src/activities/cleanup-unavailable-notifications.ts`에는 공통 조회·정리 경계가 있다.
새 Quote 유형이 이 경계와 `apps/app/src/components/notification/NotificationList.tsx`에 자동으로
포함되는 것은 아니다. 생성 시 Mute·Block을 연결하는 현재 구현에도 공백이 있으므로, 문서의 요구사항을
이미 구현된 기능으로 보지 않는다.

## 첫 질문 전 검토안

아래 표는 첫 질문 전에 제시한 제안이다. 이후 선택은 아래 응답 기록에 남기며, 현재 계약은 canonical 문서를 따른다.

| 항목             | 제안                                                                                                                                                                                   | 결정할 차이                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 제공 범위        | 로컬 작성과 원격 수신 모두 같은 Quote 알림 정책을 적용한다.                                                                                                                            | 로컬만 먼저 제공하거나 제공하지 않는 대안이 있다. 현재 질문에서 먼저 정한다.                                                                                        |
| 유형·수신자·이동 | 별도 Quote 유형으로 direct Source의 Author Profile에게 알리고, 선택하면 Quote 자체 상세로 이동한다. Related Post는 Quote, Related Profile은 Quote Author로 정의하는 안이다.            | 원문 상세로 이동하는 대안과 비교한다. Notification의 원문은 Quote의 direct Repost Source로 식별하며 새로운 Post 구조 관계를 만들지 않는다.                          |
| 자기 인용        | Quote Author와 Source Author가 같은 Profile이면 생성하지 않는다.                                                                                                                       | 같은 Account에 속한 서로 다른 Profile까지 억제할지와 Profile 단위로만 판단할지를 구분한다. 제안은 Profile 단위다.                                                   |
| 생성 시점        | 로컬 Quote가 성립한 뒤 생성한다. 원격 Quote는 검증된 인용 관계를 표시할 수 있을 때 생성 후보가 된다.                                                                                   | 원격 미승인·무효·철회 상태에서는 생성하지 않는 안이다. legacy와 재승인 의미는 원격 관계 계약의 추가 결정이 필요하다.                                                |
| 공개 범위        | Recipient가 Quote와 direct Source를 각각 조회할 수 있어야 생성·조회할 수 있다.                                                                                                         | 원문이 없어도 Quote를 볼 수 있다는 Post 정책과 별개로, 알림까지 유지할지를 결정한다. 제안은 알림을 숨기는 쪽이다.                                                   |
| Mute             | Quote Author에 대한 Profile Mute와 Quote 내용에 대한 Notification Scope의 Word·Hashtag Mute를 적용한다. Post Notification Mute는 인용된 Source의 Root Post thread를 기준으로 적용한다. | Word·Hashtag 검사에 Source 내용도 포함할지, Reply+Quote에서 Parent thread Mute와 어떻게 조합할지 정해야 한다. 나중에 생긴 Mute가 기존 Read State를 바꾸지는 않는다. |
| Block·삭제·철회  | 공통 조회 제한을 적용하고 Quote·Source 삭제나 인용 관계 철회로 조건을 잃으면 모든 알림 조회 표면에서 숨긴 뒤 비동기 정리한다.                                                          | Source 관계만 숨겨도 Quote 자체 Content는 유지한다. Recipient 자체의 복구 가능한 비활성화·정지 예외는 보존한다.                                                     |
| 플랫폼·전달      | 지원하는 클라이언트의 공통 알림함 정책으로 정의한다.                                                                                                                                   | 현재 배포·QA 상태는 제품의 영구적 플랫폼 제외와 구분한다. Push 전달 체계는 이번 결정 범위 밖이다.                                                                   |

## 2026-09-08 응답 기록

- 제공 범위, 이동 대상, 동시 중복 처리 질문에 “권장안대로”라는 응답을 받았다.
- Local·Remote 모두 제공하고, 별도 Quote 알림으로 direct Source Author에게 알리며 Quote 자체 상세로 이동한다.
- 같은 Quote·Recipient의 Reply·Quote·Mention은 Reply, Quote, Mention 순서로 한 건만 제공한다.
  Recipient가 다르면 각각 제공한다.
- 후속 질문에서 Profile 단위 자기 인용 억제와 Quote·Source 두 Post의 조회 확인을 선택했다.
  같은 Account에 속한 서로 다른 Profile이라는 이유만으로 억제하지 않는다.
- 확정된 내용은 `objects/notification.md`, `objects/post.md`,
  Quote 알림 ADR에 반영했다. 이 응답 당시에는 Mute와 원격 lifecycle 질문이 답변 대기 상태였다.
- 개별 선택을 전체 Domain Gate 또는 후속 Issue/OpenSpec Gate 승인으로 간주하지 않는다.

## 첫 조사에서 남긴 질문

1. **같은 원인과 수신자의 여러 알림.** Reply+Quote에서 Reply·Quote·Mention·Followee Post가 같은 Profile을
   가리킬 때 하나만 남길지, 유형별로 만들지 결정한다. 하나만 남기면 우선순위, 유형별 억제 이후의 선택 순서,
   원격 승인 전에 다른 알림이 이미 생성되거나 읽힌 경우의 처리까지 정해야 한다. 다른 수신자에게 가는 알림과
   전체 Notification grouping 변경은 구분한다.
2. **재처리와 재승인.** 같은 Quote 수신이나 작업 재시도가 새 Unread를 만들지 않도록 멱등성이 필요하다.
   다만 철회·정리 후 재승인이 새 알림 원인인지, 이전 알림과 최초 읽음 시각을 복구하는지, 다시 알리지 않는지는
   제품 결정이 필요하다. 이 질문은 `PROD-792`에서 정의하지 않은 재승인 관계 전이와 함께 정렬한다.
3. **뒤늦게 조회 가능해진 Quote.** 최초 생성 시 Recipient가 볼 수 없었던 Quote, 뒤늦게 승인된 Quote,
   Mute 해제 후의 Quote를 같은 재알림 대상으로 취급할지 구분한다. 기존 게시글의 일괄 소급 알림 여부도 확정한다.
4. **원격 관계의 승인 근거.** `PROD-792`는 FEP Quote의 자기 인용 또는 유효한 `QuoteAuthorization`을
   승인 근거로 적고 있지만 legacy 자동 승인 조건과 철회 후 재승인 전이는 명시하지 않는다. 이 기록이
   프로토콜 지원 정책을 대신 결정하지 않는다. 추가 결정의 범위와 owner를 이슈에 명시해야 한다.
5. **후속 책임.** Quote 알림을 채택하면 생성·조회·표시·정리의 구현 이슈를 정하고 `PROD-431`·`PROD-792`와
   연결한다. Domain Gate 승인 전에 이슈 ID나 OpenSpec 소유권을 추정해 확정하지 않는다.

## 검증 책임을 배정할 시나리오

아래는 제품 정책을 확정하기 위한 확인 목록이다. 구현 task나 완료된 테스트 결과가 아니다.

| 시나리오                                                   | 확인할 결과                                                                        | 책임 배정 상태                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 다른 Profile의 Source를 로컬에서 Quote                     | 알림 종류·수신자·이동 대상, Quote 작성 성공과 알림 결과                            | Quote 알림 후속 구현 owner 필요. 작성 자체 검증은 PROD-431 범위다.                                             |
| 같은 Profile의 자기 인용, 같은 Account의 다른 Profile 인용 | 자기 알림 억제 기준                                                                | Quote 알림 후속 구현 owner 필요.                                                                               |
| Reply+Quote가 같은/다른 수신자를 가리키고 Mention도 포함   | 중복·우선순위·억제·이미 읽은 알림 처리                                             | Quote 알림 후속 구현 owner 필요.                                                                               |
| 원격 Quote의 미승인·승인·무효·철회, 중복 수신              | 생성 여부·시점·멱등성, Source 표시와 알림의 일치                                   | 관계 검증은 PROD-792. 알림 연동 owner는 추가 배정한다.                                                         |
| 원격 legacy Quote 또는 철회 후 재승인                      | 승인 관계와 재알림 의미가 서로 모순되지 않음                                       | 상위 관계 결정과 알림 정책 모두 추가 결정이 필요하다.                                                          |
| Quote와 Source의 공개 범위가 다름                          | 각각의 조회 권한을 적용하고 존재 정보를 노출하지 않음                              | Quote 알림 생성·API 검증 owner 필요.                                                                           |
| Profile·Word·Hashtag·thread Mute 및 Block                  | 생성 억제와 기존 알림 보존·숨김의 차이                                             | 현재 suppression 구현 범위를 확인한 뒤 owner를 배정한다.                                                       |
| Quote 또는 Source 삭제·조회 불가, 승인 철회                | inbox·Unread count·Node·읽음 처리에서 일관되게 숨김. Quote 자체의 조회 정책은 유지 | Quote 알림 후속 구현 owner가 공통 predicate·정리 연동을 검증한다. PROD-328의 기존 완료 증거로 대체하지 않는다. |
| Recipient 자체의 복구 가능한 비활성화·정지                 | 숨기되 이 사유만으로 물리 삭제하지 않고 Read State를 보존                          | Quote 알림 후속 구현 owner가 공통 정리 예외의 회귀를 검증한다.                                                 |

## 다음 단계

1. 제공 범위와 위 제품 질문을 결정한다. 확정된 항목부터 `objects/notification.md`, `objects/post.md`,
   `objects/post-notification-mute.md` 등 해당 canonical 문서를 갱신한다.
2. 변경한 정책, 포함·제외 범위, 남은 질문과 후속 owner를 제시하고 Domain Gate 승인을 받는다.
3. 승인된 결과를 후속 구현 이슈와 기존 연결 이슈에 반영하고 Issue Gate를 확인한다.
4. OpenSpec이 필요한 후속 구현 이슈에서 change, 구현·통합 검증·archive 소유권을 정한다.
   PROD-903 자체의 결과를 OpenSpec 또는 구현 완료로 보고하지 않는다.

## Mute·Remote lifecycle 확정 후 점검

사람이 남은 두 정책을 권장안으로 확정하고 물리 보존 조건을 명시했다. 다음 내용을 canonical 문서와
`PROD-903`에 반영한다.

- Profile Mute는 Quote Author, Word·Hashtag Mute는 Quote 내용·태그, Post Notification Mute는 direct
  Source가 속한 원문 thread를 검사한다. Source 내용·태그는 Word·Hashtag Mute 대상으로 다시 검사하지 않는다.
- 각 Type의 생성·Mute 조건을 적용한 뒤 남은 Reply·Quote·Mention에 기존 우선순위를 적용한다.
- Remote Quote는 승인이 확인된 최초 한 번만 알린다. 같은 Quote의 재처리·재승인, 알림의 물리 정리 뒤에도
  새 알림을 만들지 않는다.
- 승인 철회·Quote 또는 Source 삭제로 무효가 되면 inbox·Unread·Node·읽음 처리에서 즉시 숨기고
  비동기로 정리한다. 일시적인 조회 불가·Recipient 비활성화만으로는 저장된 알림과 Read State를 제거하지 않는다.

기존 공통 cleanup은 Recipient 자체의 일시 비활성화만 예외로 두었다. 이번 결정은 Quote 알림의 일시적인
조회 불가에도 보존 예외를 적용한다. 다른 Notification Type의 정리 범위를 일괄 변경하지 않는다.

### 당시 남아 있던 제품 결정

1. 최초 생성이 Mute·조회 권한으로 억제됐을 때 이후 조건이 풀리면 생성할지, 기능 도입 전 Quote에 소급할지.
   이미 생성한 알림의 일시 숨김 해제와, 아직 생성하지 않은 알림의 뒤늦은 생성은 다른 경우다.
2. Reply·Mention이 이미 도착하거나 읽힌 뒤 Quote 승인이 확인됐을 때 기존 알림을 보존할지·교체할지.
   Followee Post까지 같은 중복 규칙에 포함할지도 정해야 한다.
3. 차단·공개 범위 제한 등 복구 가능한 접근 제한이 물리 보존 대상인지, 기존 unavailable 정리 대상인지.
   명시적 승인 철회·삭제와 단순 조회 실패를 구분하는 원칙은 확정했지만 원인별 분류는 질문으로 남겼다.

세 항목에 대해 Question 도구로 후속 질문을 보냈다. 전체 Domain Gate는 아직 완료하지 않는다.

첫 항목은 후속 응답으로 확정했다. 처음 Mute·조회 권한 때문에 억제된 Quote와 기능 도입 전 Quote에는
소급 생성하지 않는다. 정책 적용 대상 Remote Quote의 최초 승인은 생성 판단 시점으로 인정한다.
저장된 알림의 일시 숨김 해제는 기존 상태를 유지한다. 나머지 두 항목의 최종 응답과 구조 재검토 결과는 아래 최신 점검에 기록한다.

### 최신 upstream 계약과 연동 책임

- 새로 조회한 `PROD-902`·`PROD-924`는 Local 작성에서도 Remote Source의 수동 승인 대기가 생길 수 있다고
  명시한다. Local 작성 알림의 생성 시점과 이 상태의 연동을 후속 결정에서 확인해야 한다.
- `PROD-792`·`PROD-902`·`PROD-924`에는 legacy를 승인 상태로 인정하는 정확한 조건과 관계의 재승인 전이
  조건이 여전히 구체화되지 않았다. Quote 알림은 검증된 승인 상태를 소비하며 이 기록이 승인을 대신 정의하지 않는다.
- `PROD-902`는 인용 허용·승인·철회 도메인 정책, `PROD-431`은 작성 API·core·Composer,
  `PROD-792`는 원격 Quote 검증·표시, `PROD-924`는 발신·승인·철회 연합 lifecycle과 그 통합 검증을 소유한다.
- Quote 알림의 생성·영구 중복 방지·조회·UI·보존/정리 연동을 소유할 구현 이슈는 아직 정하지 않았다.
  이 결과를 소유할 이슈에 담당 테스트와 Quote 알림 전체 통합 검증·OpenSpec 완료/archive 책임도 명시해야 한다.
  기존 `PROD-328`의 cleanup 완료를 새 Quote 유형의 검증 증거로 대신하지 않는다.

`PROD-902`의 `0027-quote-consent-and-federation.md`와 번호가 겹쳐 이 작업의 ADR을
`0028-quote-notification-policy.md`로 변경했다. 다른 작업 공간의 문서는 수정하지 않았다.
원격 승인 정책 문서는 별도 `PROD-902` 작업 공간의 미병합 변경이므로 통합 시 함께 대조해야 한다.

Local 작성의 승인 대기 연동도 후속 응답으로 확정했다. 인용 관계가 승인되어 Source를 정상 표시할 수 있을 때
최초 알림을 판단하고, 대기·거절 중에는 Quote 알림을 만들지 않는다. 이 응답 당시에는 늦은 다른 Type·Followee Post 중복과 조회 제한 원인별 보존 분류가 남아 있었다. legacy 승인 판정은 upstream
인용 관계 owner와 정렬할 의존성으로 유지한다.

## 최신 결정과 Post 구조 재검토

- 같은 Quote·Recipient의 Mention Notification이 먼저 생성되면 이후 Quote 관계가 승인돼도 Quote 알림을
  추가하지 않는다. 기존 Mention Notification과 Read State·최초 읽음 시각을 보존한다.
- Quote·Mention이 처음부터 동시에 생성 후보이면 Type별 생성·Mute 조건 적용 후 Quote를 우선한다.
  Followee Post는 중복 제거에 포함하지 않고 기존 독립 정책을 유지한다.
- Block·공개 범위 변경 등 복구 가능한 조회 제한에서는 Quote Notification을 모든 조회·읽음 표면에서만
  숨긴다. Notification과 Read State를 보존하고 조회 가능성이 회복되면 같은 상태를 사용한다.
- 승인 철회·Quote 삭제·Source 삭제 등 관계가 확정적으로 무효가 된 경우에만 즉시 숨기고 비동기로 물리 정리한다.

사용자는 Reply와 Quote가 구조상 동시에 성립할 수 없다면 관련 전제를 제거하도록 요청했다. 전체
`docs`, `memory`, `openspec` Markdown을 검색한 결과 관련 표현은 49개 파일의 132개 행에서 발견됐다.
ADR 0014, Post canonical, `packages/core/services/post-structure.ts`와 구조 테스트는
Content·Reply Parent·Repost Source가 함께 있는 조합을 명시적으로 허용한다. 최신 PROD-431도 이 조합의
작성·통합 검증을 범위에 포함한다. 최신 `origin/main`의 `226c1052`에서도 구조 허용 근거가 유지된다.
현재 Local 작성 API에 Source 입력이 없는 것은 작성 경로의 미구현이며 구조 금지 근거가 아니다.

따라서 Post 구조·설계 문서·기존 OpenSpec에 있는 유효한 Reply+Quote 시나리오는 제거하지 않았다.
이번 작업에서는 OpenSpec을 수정하지 않았다. Reply 우선 알림 규칙은 구조 규칙과 별개이므로 유지 여부와
먼저 생성된 Reply 이후 Quote 승인 처리에 대한 Question을 보냈다. 이 질문은 아래 최종 응답으로 확정됐다.
이전 질문·응답 기록은 당시 검토 이력이며 현재 확정 정책은 위 최신 결정과 Notification canonical을 따른다.

## Domain Gate 제출 내용과 후속 책임 제안

Domain Gate에서는 Local·Remote 제공, 전용 Type·direct Source Recipient·Quote 이동, Profile 자기 인용 억제,
두 Post 조회 권한, Mute 대상, 승인 후 최초 판단, 재처리·재승인·소급 생성 금지, Quote·Mention 중복,
Followee Post 독립, 복구 가능한 제한의 상태 보존과 확정적 무효의 정리를 함께 검토한다.
Reply가 함께 성립하는 경우의 중복 처리도 아래 최종 응답으로 확정됐다. 전체 정책과 후속 책임 제안이 최종 검토 대상이다.
승인 판정의 legacy·재승인 조건은 PROD-902/792/924의 관계 계약 의존성이며 알림이 자체 승인 규칙을 만들지 않는다.

후속 이슈는 **“Quote Notification을 생성·조회하고 보존·정리한다”** 한 건을 제안했다. 최종 승인 뒤
[PROD-926](https://linear.app/byulmaru/issue/PROD-926)으로 생성하고 정혜주에게 배정했다. 아래 표는 승인된
owner와 범위이며, PROD-926의 Issue Gate와 OpenSpec 검토는 별도로 진행한다.

| 책임           | 제안 owner와 범위                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 구현 총괄      | 정혜주. Quote Type·원인 관계, Local·Remote 승인 후 생성 연동, 영구 중복 방지와 최초 억제 기록, 조회·읽음·unread·inbox·Quote 상세 이동, 보존과 비동기 정리를 후속 이슈가 소유한다.                                                                             |
| Mention 연동   | 원격 Mention 구현은 PROD-911의 Jiyu Park가 소유한다. 후속 Quote 이슈는 동시 후보와 Mention 선생성 보존의 교차 Type 계약·통합 검증을 소유하고 PROD-911과 정렬한다. Local Mention과 FCM transport까지 확장하지 않는다.                                          |
| 승인 관계 연동 | PROD-431의 작성, PROD-792의 원격 검증·표시, PROD-924의 발신·승인·철회 결과를 소비한다. 승인 프로토콜 자체를 Quote 알림 이슈에서 재구현하지 않는다.                                                                                                            |
| OpenSpec       | Domain·Issue Gate 이후 후속 Quote 이슈와 정혜주가 알림 lifecycle change의 작성·delta·tasks를 소유한다. PROD-903에서는 작성하지 않는다. PROD-902/924의 별도 인용 승인 change 책임을 가져오지 않는다.                                                           |
| 통합 검증      | 후속 Quote 이슈와 정혜주. Local 작성·Remote 승인부터 생성·목록·읽음·unread·Node·상세 이동, Mute·Block·공개 범위 제한과 복구, 철회·삭제·재시도·재승인, Mention 중복과 기존 Reply·Repost 회귀까지 실제 연결을 검증한다. 지원 클라이언트별 검증 증거를 구분한다. |
| 완료·archive   | 후속 Quote 이슈와 정혜주. 선언한 전체 구현 범위와 모든 task, 교차 이슈 통합 검증, strict validation과 delta 동기화가 완료된 뒤에만 해당 change를 archive한다. 개별 PR 완료나 부모·선행 이슈 상태로 완료를 추정하지 않는다.                                    |

PROD-911은 inbound Mention만 포함하며 Local Mention 생성은 명시적으로 제외한다. 이번 Quote 정책이
Local Mention 신규 기능을 추가하는 요구로 확대되지는 않는다. Quote·Mention 중복 계약의 실제 검증은
PROD-911의 인앱 결과와 연결하되 FCM 완료를 Quote 알림 완료의 선행 조건으로 추가하지 않는다.
PROD-903은 정책·canonical 정렬과 후속 책임 제안까지 소유하며 구현·OpenSpec·archive를 수행하지 않는다.

## 마지막 제품 결정 확정

사용자는 Reply 선생성 처리에도 “Mention과 동일한 원칙”을 적용하도록 확정했다. 같은 Quote·Recipient에
Reply Notification이 먼저 생성됐다면 이후 Quote 승인으로 알림을 추가하지 않고 기존 Notification과
Read State·최초 읽음 시각을 보존한다. 동시 후보의 기존 Reply → Quote → Mention 우선순위는 유지한다.

PROD-903의 직접 제품 정책상 미결정 사항은 없다. 위 Domain Gate 제출 항목에 이 결정을 포함한다.
후속 owner·범위·OpenSpec·통합 검증·완료/archive는 위 제안대로 최종 검토 대상으로 남았다. 이번 개별
정책 응답을 전체 Domain Gate나 후속 구현 착수 승인으로 확대하지 않는다.

## 최종 승인 기록

사용자가 “Spec Gate 승인”이라고 명시했다. 이번 승인은 PROD-903의 확정 정책 전체와 제시한 후속 책임안에
대한 최종 승인으로 기록한다. Domain 전용 이슈이므로 해당 정책 결과의 Domain Gate는 통과했으며, 아직
작성하지 않은 후속 구현 OpenSpec의 Spec Gate를 통과한 것으로 간주하지 않는다.

정혜주가 후속 Quote Notification 구현, OpenSpec, 통합 검증과 해당 change 완료/archive를 소유하는 안을
승인된 다음 단계의 입력으로 사용한다. 후속 이슈는
[PROD-926](https://linear.app/byulmaru/issue/PROD-926)으로 생성·배정했으며 Issue Gate 승인은 아직 남아 있다.
PROD-903에서 OpenSpec이나 구현을 진행하지 않으며, 문서의 commit·PR·merge와 이슈 완료는 별도로 추적한다.
