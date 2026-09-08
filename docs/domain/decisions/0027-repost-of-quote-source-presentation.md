# ADR 0027: Repost of Quote Source Presentation

## 상태

Accepted

2026-09-08 PROD-828 Spec 대화에서 사람이 `X(Twitter) 방식대로`를 선택했다. 같은 task에서
`PROD-828 Domain Gate 승인`으로 이 ADR의 구체 적용안과 후속 책임을 다음 gate의 입력으로 사용하는 것을
명시적으로 승인했다. 이 승인은 PROD-922의 Issue Gate나 이후 OpenSpec Gate 승인을 대신하지 않는다.

## 날짜

2026-09-08

## 승인 근거

- 승인자: 현재 task의 사용자 정혜주
- 승인 문구: `PROD-828 Domain Gate 승인`
- 승인 대상: 이 ADR의 결정안, canonical Post·Post Action Bar 반영과 PROD-922의 후속 책임
- 다음 gate: PROD-922 Issue Gate
- 포함하지 않은 승인: PROD-922 Issue Gate, OpenSpec Gate, 구현·배포

## 맥락

순수 Repost의 직접 Source는 Content가 있는 Quote일 수 있다. 재게시한 Quote의 본문만 보여주면
인용 원문을 전제로 쓴 내용을 목록에서 이해하기 어렵다. 반면 Source 관계를 계속 펼치면 목록 항목이
끝없이 깊어지고, 작성자·이동 대상과 접근성 구조를 구분하기 어려워진다.

PROD-828은 이 표시 깊이를 결정하는 Domain Gate다. 저장·생성·취소·Notification이나 순수 Repost의 canonical
이동 대상을 다시 결정하지 않으며, 기존 `add-post-reposts` archive를 소유하지 않는다.

## 결정안

- Repost attribution 아래에는 직접 Source Quote의 Author와 Content를 주된 게시 내용으로 표시한다.
- 해당 Quote가 직접 인용한 조회 가능한 Source를 한 단계 preview로 함께 표시한다. Content 없는 Repost를
  거치는 것은 Quote의 인용 맥락을 숨길 이유가 되지 않는다.
- preview 대상도 Quote이면 그 대상의 Author와 Content까지만 표시한다. 그 아래 Source를 재귀적으로
  표시하거나 이를 대신하는 placeholder·별도 진입 안내는 추가하지 않는다.
- 각 Source를 조회할 수 있는지 독립적으로 판정한다. Quote가 인용한 Source를 표시할 수 없어도 Quote 자체를
  조회할 수 있으면 Quote의 Content와 이를 재게시한 항목은 유지한다.
- 순수 Repost의 본문·생성 시각·직접 상세 URL과 Repost·Reaction·Bookmark·More의 대상은 직접 Source
  Quote다. preview의 본문·생성 시각만 그 preview 대상의 상세로 이동한다. 각 Author는 자신의 Profile로
  이동한다. 기존 직접 관계를 더 깊은 Source로 평탄화하지 않는다.
- 순수 Repost 목록의 Reply는 바깥 contentless Post의 기존 disabled 계약을 유지한다. Quote 상세로
  이동한 뒤의 Reply는 Quote 자체의 기존 정책을 따른다.
- 목록 항목 하나의 article과 Action Bar 하나를 유지하며, preview 안에 전체 게시글 renderer·article·Link를
  재귀적으로 중첩하지 않는다. 상세한 입력·배치 경계는 canonical 디자인 문서가 소유한다.

## 고려한 대안

| 대안                                          | 이점                                                            | 감수할 결과                                       | 판단                          |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- | ----------------------------- |
| Quote 본문과 직접 인용 Source preview 한 단계 | 재게시한 Quote의 맥락을 일반 Quote와 같은 방식으로 읽을 수 있다 | 현재 목록에 preview를 추가하고 회귀 검증해야 한다 | 사람이 선택한 X 방식의 적용안 |
| Quote 본문만 표시                             | 현재 목록 구현을 유지하고 항목 높이를 줄인다                    | 인용 원문은 Quote 상세에 들어가야 확인할 수 있다  | 선택하지 않음                 |
| Source 관계를 여러 단계 재귀 표시             | 더 많은 인용 맥락을 한 항목에서 제공한다                        | 항목 높이·조회 범위·이동·접근성 구조가 복잡해진다 | 선택하지 않음                 |

## 근거와 적용 범위

- [PROD-828](https://linear.app/byulmaru/issue/PROD-828)의 현재 Domain Gate 범위와 2026-09-08 사람의 표시 방향
  선택을 제품 결정의 근거로 사용한다.
- [X Repost FAQ](https://help.x.com/en/using-x/repost-faqs)는 재게시가 원 게시물의 작성자·내용을 유지하고
  재게시자 표시로 구분된다고 설명한다. [X의 Repost·Quote 안내](https://help.x.com/en/using-x/how-to-repost)는
  Quote가 공유한 Post를 참조한다고 설명한다.
- 한 단계 cutoff와 KOSMO의 article·Link·Reply 정책은 X 문서에서 그대로 가져온 계약이 아니다. 기존
  KOSMO 계약과 사람의 표시 방향을 결합한 이번 적용안이며, X의 모든 플랫폼·비공개 상태·세부 UI를 복제한다는
  의미로 사용하지 않는다. X의 실제 runtime은 이번 조사에서 직접 관찰하지 않았다.
- [ADR 0014](./0014-post-structure-relations.md)의 관계 조합,
  [Post](../objects/post.md)의 직접 참조·조회 정책과
  [Post Action Bar](../../design/post-action-bar.md)의 입력·대상 계약을 유지한다.

## 후속 책임과 완료 경계

PROD-828은 canonical 문서·이 결정안·후속 책임 정렬과 승인 근거를 소유한다.
[PROD-922](https://linear.app/byulmaru/issue/PROD-922)는 preview 표시, 필요한 fragment 소비,
Storybook·실제 화면 검증과 새 OpenSpec의 통합 검증·동기화·archive를 소유한다. PROD-922는 Backlog 초안이며
PROD-828에 blocked 관계로 연결해 초안을 검토했다. Domain Gate 승인 뒤 이 blocker를 해제했으며 부모·자식
계층을 새로 만들지 않았다. PROD-922의 Issue Gate가 승인되기 전에는 새 OpenSpec을 생성하지 않는다.

기존 `add-post-reposts` archive와 완료된 PROD-389·PROD-415·PROD-505를 다시 열거나 과거 기록을 덮어쓰지
않는다. 현재 `post-repost-ui` 명세가 PROD-828로 미룬 조합은 후속 구현 이슈의 새 change에서 구체화한다.
PROD-670·PROD-904의 게시 활동 목록, PROD-431의 Quote 작성, federation·Quote 알림은 이 결정의 구현 범위가
아니다. 원격 Quote의 승인·철회·resolution과 Source 반환 정책은 PROD-792가 계속 소유하며, PROD-922는
반환된 nullable Source를 소비한다.

## 문서 반영

- [Post](../objects/post.md)는 Source가 Quote인 순수 Repost의 표시 깊이와 기존 조회 정책을 정의한다.
- [Post Action Bar](../../design/post-action-bar.md#source가-quote인-순수-repost)는 표시 순서, article·Link,
  Action Bar와 상세 진입 경계를 정의한다.
- [검토 기록](../records/2026-09-08-repost-of-quote-display-review.md)은 현재 구현 차이, 검증 공백과 승인
  대상을 기록한다.
