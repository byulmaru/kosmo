# ADR 0028: Quote Notification Policy

## 상태

Accepted — 사용자의 “Spec Gate 승인” 응답으로 PROD-903 정책 결과와 후속 책임안을 승인했다. 제품 정책의 미결정 사항은 없다. 이 이슈는 Domain 전용이며 후속 구현 OpenSpec의 승인은 포함하지 않는다.

2026-09-09 PR #803 리뷰 후 사람의 명시적 요청으로 조회 제한의 보존 보장을 아래 결정으로 대체했다.
이전 대화의 보존 보장은 더 이상 현재 계약이 아니다.

2026-10-12 사용자의 명시적 요청으로 최초 동시 후보 우선순위를 Reply → Mention → Quote로 변경했다.
2026-09-09의 이전 순서와 그 유지 이유는 역사적 기록이며 현재 우선순위의 근거가 아니다. 이 우선순위
변경으로 이미 저장된 Notification의 ID, Type, Read State와 최초 읽음 시각을 바꾸거나 소급 교체·생성하지 않는다.

2026-10-13 Notification 행의 API 조회 권한을 Quote/source 객체 조회 권한과 분리했다. 저장 행이 존재하는 동안에는
Recipient 권한으로 조회하고, Quote/source 필드는 현재 요청의 기존 객체 조회 권한을 적용한다. 기존 비동기 정리 정책은 유지한다.

2026-10-16 사용자의 승인으로 Quote Notification에서 원래 행동 Account를 다른 대상 Profile에서도 제외하며, 기존 Profile 단위 자기 인용 억제는 유지한다. 현재 억제 범위는 [Notification](../objects/notification.md)에 정의한다.

## 날짜

2026-09-08

## 근거

- [PROD-903](https://linear.app/byulmaru/issue/PROD-903)의 정책 결정 범위.
- PROD-903 Spec 대화에서 제공 범위, 유형·수신자·이동 대상, 동시 중복 처리의 권장안에 대한 사람의
  “권장안대로” 응답.
- 최초 동시 우선순위는 Codex가 권장하고 사람이 채택했다. 당시 Quote의 위치를 선택한 상세 이유는
  기록되지 않았다. 2026-09-09 리뷰 재검토 뒤 사람의 “PR에 반영” 요청으로 당시 순서의 유지 이유를 확정했다.
- 2026-10-12 사용자가 Reply → Mention → Quote 순서를 명시적으로 요청해 기존 Reply → Quote → Mention을
  대체했다.
- 같은 대화의 후속 질문에서 당시 “Profile 단위 자기 인용 억제 + 두 글의 조회 권한 확인 (권장)”을 선택했다.
  Profile 단위 자기 인용 억제는 유지하고, 같은 Account의 다른 Profile도 알림 대상에서 제외하지 않는다는 부분은
  2026-10-16 승인으로 대체했다.
- 같은 대화에서 Mute 적용 대상, Remote Quote 최초 1회 생성, 철회·삭제 시 숨김·정리와
  일시적인 조회 불가·Recipient 비활성화 시 물리 보존을 명시적으로 확정한 응답.
- 후속 질문에서 “억제 후·기능 도입 전 Quote는 소급 생성하지 않음 (권장)” 선택.
- 후속 질문에서 “로컬 작성도 인용 관계 승인 후 최초 판단 (권장)” 선택.
- 2026-09-08 응답에서 Mention 선생성·Read State 유지, 당시 동시 후보 Quote 우선, Followee Post 독립을 확정했다.
  이전 우선순위는 2026-10-12 요청으로 대체했다. 당시 조회 제한의 보존 보장은 2026-09-09 리뷰 반영 요청으로 철회됐다.
- [ADR 0014](./0014-post-structure-relations.md)의 Quote 관계 조합과
  [ADR 0015](./0015-post-share-reference.md)의 Quote 자체 상세 경로.

## 결정

- 먼저 생성된 Reply가 있으면 이후 Quote 승인으로 별도 알림을 추가하지 않고 기존 Reply Notification과
  Read State·최초 읽음 시각을 유지한다. 이 규칙은 동시 후보의 우선순위와 별개다.

- Local 작성과 Remote 수신 모두 Quote 알림을 제공한다.
- 별도 Quote Notification Type을 사용하고 direct Repost Source의 Author Profile에게 알린다.
- Related Post는 원인 Quote Post, Related Profile은 Quote Author Profile이다. 알림을 선택하면 Quote 자체
  상세로 이동한다. Notification 원문은 Quote의 direct Repost Source로 식별한다.
- 같은 Quote와 같은 Recipient에게 Reply·Mention·Quote가 최초 선택 시 함께 후보이면 각 Type의
  생성·Mute 조건을 적용한 뒤 Reply, Mention, Quote 순서로 한 건만 선택한다. 이 우선순위는 독립적인
  비동기 처리의 도착 순서와 무관하며 다른 Recipient의 알림은 각각 판정한다.
- 우선순위는 최초 대표 Notification 선택에만 적용한다. 이미 저장된 대표 Notification은 ID, Type, Read State와
  최초 읽음 시각을 유지하며 이후 더 높은 우선순위 Type이 생성 가능해져도 추가·교체하거나 소급 생성하지 않는다.
  Quote 승인이 늦어 이미 생성된 Reply 또는 Mention이 있을 때도 같다. Followee Post는 독립 정책을 유지한다.
- Quote 자기 행동 억제와 원래 행동 Account 제외는 [Notification](../objects/notification.md) 정책을 따른다.
- Recipient가 Quote와 direct Source를 모두 조회할 수 있어야 새 알림을 생성한다. 저장된 Notification 행의 API 조회는
  Recipient 권한을 따르며, Quote/source 필드는 현재 요청의 기존 객체 조회 권한을 적용한다.
  Source가 조회 불가여도 Quote 자체 Content를 유지하는 Post 정책은 바꾸지 않는다.
- Profile Mute는 Quote Author, Word·Hashtag Mute는 Quote 내용·Hashtag, Post Notification Mute는
  direct Source가 속한 원문 thread를 검사한다. Word·Hashtag Mute에서 Source 내용을 다시 검사하지 않는다.
- 각 Type의 생성·Mute 조건을 먼저 적용하고 남은 Reply·Mention·Quote 후보에 우선순위를 적용한다.
- Remote Quote는 승인이 확인된 최초 한 번만 알림을 생성하며 같은 Quote의 재처리·재승인은 새 알림을 만들지 않는다.
- Local 작성도 인용 관계 승인 후 Source를 정상 표시할 수 있을 때 최초 알림을 판단한다.
  승인 대기·거절 중에는 Quote 알림을 생성하지 않는다.
- 첫 생성 판단에서 Mute·조회 권한으로 억제됐거나 기능 도입 전에 존재한 Quote에는 소급 알림을 만들지 않는다.
  정책이 적용되는 Remote Quote의 최초 승인은 생성 판단 시점으로 인정한다. 저장된 행의 Quote/source 필드가 다시 조회 가능해지는 것은 새 Notification 생성과 구분한다.
- 승인 철회·Quote 또는 Source 삭제로 무효가 되면 기존 unavailable Notification 정책에 따라 비동기로 정리한다.
  정리 전까지 저장 행은 Recipient 권한으로 조회할 수 있고 Quote/source 필드는 기존 객체 조회 권한에 따라 null/unavailable일 수 있다.
  물리 정리 뒤에는 같은 Quote에 다시 알리지 않는다.
- Block·공개 범위 변경 등으로 Quote 또는 direct Source를 현재 조회할 수 없어도 저장 행의 Node·목록·count·읽음 처리는
  Recipient 권한을 따른다. Related Post와 source 필드는 기존 객체 조회 권한을 적용한다. 기존 unavailable Notification 정책에 따른
  Best Effort 비동기 정리와 삭제 시점·성공의 비보장은 유지한다.
- 비동기 정리 전에 조회 제한이 풀리면 저장된 행의 Quote/source 필드가 다시 조회 가능해질 수 있다. 이때 Notification ID,
  Read State와 최초 읽음 시각은 유지된다. 물리 정리 뒤 보존이나 복원은 보장하지 않는다. 승인 철회·Quote/direct Source 삭제도
  기존 정리 정책을 따르며, 정리 뒤 재처리·재승인으로 새 알림을 생성하거나 복원하지 않는다.
- Quote 전용 cleanup 보존 예외는 제거한다. Recipient 자체의 일시 비활성화·정지에 대한 기존 공통 예외는
  유지하며 Quote/direct Source 조회 불가 전반으로 확대하지 않는다.

## 이유와 결과

Quote는 자체 Content와 상세 경로를 가진다. 별도 알림에서 Quote로 이동하면 수신자가 인용글을 바로
확인할 수 있다. 원인은 같은 Quote이고 수신자도 같을 때 최초 대표 알림을 한 건으로 제한한다. 이 규칙을
전체 Notification grouping 변경으로 넓히지 않는다.

2026-09-09 재검토에서도 ADR 0014와 Post 구조 검증·테스트는 Reply와 Quote의 동시 성립을 허용한다.
따라서 해당 조합은 제거하지 않는다. 다만 구조가 알림 순서를 필연적으로 정하지는 않는다.

### 2026-10-12 사용자 지정 우선순위

사용자가 명시한 순서는 Reply → Mention → Quote다. 이 순서는 최초 선택에서 Type별 생성·Mute 조건을 통과한
후보를 정하며, 독립적인 비동기 처리의 도착 순서와 무관하다.

이미 대표 Notification이 저장된 뒤 더 높은 우선순위 Type이 생성 가능해져도 기존 ID, Type, Read State와
최초 읽음 시각을 유지한다. 소급 교체·추가·생성하지 않으며, Quote 승인이 늦게 확인된 경우에도 같다.

### 2026-09-09 재검토에서 확정한 유지 이유

다음은 이전 Reply → Quote → Mention 순서의 당시 이유다. 2026-10-12 사용자 지정이 해당 순서를 대체했으므로
현재 우선순위의 근거로 사용하지 않는다.

[기존 Reply/Mention 분류 계약](../objects/notification.md#replymention-수신자별-분류와-중복-처리)은
수신자의 Post에 답하면서 같은 수신자를 Mention하면 Reply 한 건을 제공한다. 이 선행 계약은
[PROD-884의 PR #778](https://github.com/byulmaru/kosmo/pull/778)에 있으며 Quote의 위치까지 정하지는 않았다.

당시 순서는 같은 글·수신자의 알림을 하나로 줄일 때 수신자의 글에 생긴 반응을 대표 정보로 전달하기 위해
유지했다. Reply 후보가 있으면 내 글에 달린 답글을 우선해 기존 분류를 유지했다. Reply 없이 Quote와 Mention이
겹치면 내 글이 인용됐다는 사실을 대표 알림으로 선택한다. Mention의 알림 이유는 수신자가 언급됐다는 사실을
전달하지만 인용 관계까지 설명하지는 않는다. 게시글 안의 인용 내용 표시는 별개이며,
[Notification presentation](../../design/notifications.md)의 Reply 알림도 글에 포함된 인용 내용을 유지한다.

Mention이 덜 직접적이거나 덜 중요하다는 판단은 아니다. 중복 상황에서 Mention 대신 답글·인용을 대표 유형으로
남기는 절충이었다.

### 다른 정책과의 경계

Quote와 Mention만 최초 선택 후보인 경우에도 Type별 생성·Mute 조건을 먼저 적용하고 둘 다 남으면 Mention 한 건을
제공한다. 승인 대기 중 Mention이 이미 생성됐다면 이후 승인으로 Quote를 추가하거나 기존 Mention의 Type을
교체하지 않는다. 이미 저장된 알림의 ID, Type, Read State와 최초 읽음 시각을 그 승인 처리에서 변경하지 않는 규칙이며,
조회 불가에 따른 물리 보존·복원 보장과는 별개다. Followee Post는 독립 정책을 따른다.

2026-09-09 당시에는 PR #803의 제안과 후속 사람의 결정을 받아들여 조회 제한의 보존 보장을 완화했다. 조회 불가 시
즉시 숨기는 결과를 보장했고, 물리 정리는 기존 unavailable 정책에 맡겼다. cleanup 실행 시점에 따라 제한 해제 후
알림이 다시 보이거나 이미 삭제되어 보이지 않을 수 있다는 결과를 허용했다. 이 즉시 숨김 설명은 위 2026-10-13
행·source 필드 권한 결정으로 대체됐다.

알림 제공 여부는 원문과 인용글의 조회 권한을 넓히지 않는다. 2026-10-16 결정 전에는 Profile 단위 자기 인용
억제를 적용하고 Account를 공유하는 다른 Profile은 억제하지 않는다고 결정했다. Account 공유에 관한 그 부분은
역사적 결정이며 현재 규칙은 [Notification의 Profile 범위 수신 정책](../objects/notification.md)에 따른다.

## 검토한 대안

- Local 작성만 먼저 제공하거나 Quote 알림을 제공하지 않는 안 대신 Local·Remote 모두 제공하는 안을 선택했다.
- 원문 상세로 이동하는 안 대신 Quote 자체 상세로 이동하는 안을 선택했다.
- 유형별 개별 알림 대신 최초 선택에서 한 건을 제공한다. 기존 Reply → Quote → Mention 순서는
  2026-10-12 사용자 요청으로 Reply → Mention → Quote로 대체했다.
- 당시에는 Account 단위 자기 인용 억제 대신 Profile 단위 억제와 두 Post의 조회 확인을 선택했다. 같은 Account의
  다른 Profile을 억제하지 않는다는 부분은 2026-10-16 결정으로 대체됐다.
- 복구 가능한 제한에서 저장 상태와 복원을 보장하던 이전 선택은 철회했다. 기존 unavailable 정책과 같은
  Best Effort 정리를 선택했으며, 조회 제한 해제 후의 복원을 보장하지 않는 결과를 허용한다.

## 남은 결정

현재 Post 구조는 Reply와 Quote의 동시 성립을 허용하므로 해당 구조 전제는 제거하지 않는다. 최초 후보는
Reply → Mention → Quote 순서로 선택하며, 이미 저장된 대표 Notification은 뒤늦게 더 높은 우선순위 Type이
생성 가능해져도 보존한다. PROD-903 자체의 제품 정책상 미결정 사항은 없다.
Followee Post는 독립 정책을 따르며, 저장 Notification 행은 존재하는 동안 Recipient 권한으로 조회하고 Related
Profile·Related Post·source 필드는 각각의 일반 객체 조회 권한을 따른다. 기존 unavailable Notification 정책의
Best Effort 정리는 유지한다.
원격 관계의 legacy 승인·재승인 허용 조건은 해당 관계 owner가 확정해야 하며, 알림의 재승인 시 재생성 금지와
구분한다. 후속 구현·OpenSpec·통합 검증·archive owner는 정혜주로 승인됐고,
[PROD-926](https://linear.app/byulmaru/issue/PROD-926)으로 생성·배정했다. 해당 이슈의 Issue Gate와
OpenSpec 검토는 다음 단계다.

## 문서 반영

- [Notification](../objects/notification.md): 유형·원인·수신자·이동·자기 인용·조회·동시 중복 정책.
- [Post](../objects/post.md): Quote 알림 정책의 소유 문서 연결.
- [Post Notification Mute](../objects/post-notification-mute.md): direct Source의 원문 thread 기준.
- [Word Mute Rule](../objects/word-mute-rule.md), [Hashtag Mute Rule](../objects/hashtag-mute-rule.md): Quote 내용·태그만 검사.
